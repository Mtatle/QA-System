const SPREADSHEET_ID = '1aFwtxh9kxwZ-YFqxKVVO6DCQ9AlK1Hb4uqXVrNWDQPA';
const ASSIGNMENTS_SHEET = 'Assignments';
const POOL_SHEET = 'Pool';
const SESSION_LOGS_SHEET = 'Session Logs';
const DATA_SHEET = 'Data';

const ASSIGNMENTS_HEADERS = [
  'send_id',
  'assignee_email',
  'status',
  'assignment_id',
  'created_at',
  'updated_at',
  'done_at',
  'editor_token',
  'viewer_token',
  'form_state_json',
  'internal_note'
];

const POOL_HEADERS = ['send_id', 'status'];
const ACTIVE_ASSIGNMENT_STATUSES = { ASSIGNED: true, IN_PROGRESS: true };

function doGet(e) {
  try {
    const action = getRequestAction_(e);
    if (action === 'queue') {
      const email = getParam_(e, 'email');
      const appBase = getParam_(e, 'app_base');
      if (!email) return jsonResponse_({ error: 'Missing required query param: email' });

      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const assignments = getOrTopUpQueue_(normalizeEmail_(email), appBase);
        return jsonResponse_({ assignments: assignments });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'getAssignment') {
      const assignmentId = getParam_(e, 'assignment_id');
      const token = getParam_(e, 'token');
      if (!assignmentId || !token) {
        return jsonResponse_({ error: 'Missing required query params: assignment_id and token' });
      }

      const assignment = getAssignmentById_(assignmentId);
      if (!assignment) return jsonResponse_({ error: 'Assignment not found' });

      const role = tokenRoleForAssignment_(assignment, token);
      if (!role) return jsonResponse_({ error: 'Unauthorized token' });

      return jsonResponse_({
        assignment: {
          assignment_id: assignment.assignment_id,
          send_id: assignment.send_id,
          status: assignment.status,
          form_state_json: assignment.form_state_json || '',
          internal_note: assignment.internal_note || '',
          role: role
        }
      });
    }

    return jsonResponse_({ status: 'ok', message: 'Agent Training Data Collector is running' });
  } catch (error) {
    console.error('Error in doGet:', error);
    return jsonResponse_({ error: String(error) });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No POST data received. This function should be called via HTTP POST.');
    }

    const data = JSON.parse(e.postData.contents);
    const action = getRequestAction_(e, data);

    if (action === 'saveDraft') {
      const assignmentId = data.assignment_id;
      const token = data.token;
      if (!assignmentId || !token) return jsonResponse_({ error: 'Missing assignment_id or token' });

      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const result = updateAssignmentDraft_(assignmentId, token, data.form_state_json, data.internal_note);
        if (result.error) return jsonResponse_({ error: result.error });
        return jsonResponse_({ ok: true });
      } finally {
        lock.releaseLock();
      }
    }

    if (action === 'done') {
      const assignmentId = data.assignment_id;
      const token = data.token;
      if (!assignmentId || !token) return jsonResponse_({ error: 'Missing assignment_id or token' });

      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
        const completed = markAssignmentDone_(assignmentId, token);
        if (completed.error) return jsonResponse_({ error: completed.error });

        const assignments = getOrTopUpQueue_(completed.assignee_email, data.app_base);
        return jsonResponse_({ assignments: assignments });
      } finally {
        lock.releaseLock();
      }
    }

    // Existing session logging/evaluation/chat logging behavior
    return handleLegacyPost_(data);
  } catch (error) {
    console.error('Error in doPost:', error);
    return jsonResponse_({ status: 'error', message: String(error), error: String(error) });
  }
}

function handleLegacyPost_(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getActiveSheet();

  if (data && data.eventType && (data.eventType === 'sessionLogin' || data.eventType === 'sessionLogout')) {
    let logsSheet = spreadsheet.getSheetByName(SESSION_LOGS_SHEET);
    if (!logsSheet) {
      logsSheet = spreadsheet.insertSheet(SESSION_LOGS_SHEET);
      logsSheet.getRange(1, 1, 1, 9).setValues([[
        'Date (EST)', 'Agent Name', 'Agent Email', 'Event', 'Global Session ID', 'Login Method', 'Login At', 'Logout At', 'Duration (mins)'
      ]]);
    }

    const sessionId = data.sessionId || '';
    if (data.eventType === 'sessionLogin') {
      safeAppendRow(logsSheet, [
        data.loginAt || '',
        data.agentUsername || '',
        data.agentEmail || '',
        'login',
        sessionId,
        data.loginMethod || '',
        data.loginAt || '',
        '',
        ''
      ]);
      return jsonResponse_({ status: 'success' });
    }

    if (data.eventType === 'sessionLogout') {
      const lastRow = logsSheet.getLastRow();
      for (let i = lastRow; i >= 2; i--) {
        const existingSessionId = logsSheet.getRange(i, 5).getValue();
        const eventCell = logsSheet.getRange(i, 4).getValue();
        if (existingSessionId && existingSessionId.toString() === sessionId && eventCell === 'login') {
          logsSheet.getRange(i, 8).setValue(data.logoutAt || '');
          logsSheet.getRange(i, 9).setValue('');
          return jsonResponse_({ status: 'success' });
        }
      }

      safeAppendRow(logsSheet, [
        data.logoutAt || '',
        data.agentUsername || '',
        data.agentEmail || '',
        'logout',
        sessionId,
        data.loginMethod || '',
        '',
        data.logoutAt || '',
        ''
      ]);
      return jsonResponse_({ status: 'success' });
    }

    return jsonResponse_({ status: 'success' });
  }

  if (data && data.eventType === 'evaluationFormSubmission') {
    let dataSheet = spreadsheet.getSheetByName(DATA_SHEET);
    if (!dataSheet) {
      dataSheet = spreadsheet.insertSheet(DATA_SHEET);
      dataSheet.getRange(1, 1, 1, 14).setValues([[
        'Timestamp', 'Email Address', 'Message ID', 'Audit Time',
        'Issue Identification', 'Proper Resolution', 'Product Sales', 'Accuracy',
        'Workflow', 'Clarity', 'Tone',
        'Efficient Troubleshooting Miss', 'Zero Tolerance', 'Notes'
      ]]);
    }

    safeAppendRow(dataSheet, [
      data.timestamp || '',
      data.emailAddress || '',
      data.messageId || '',
      data.auditTime || '',
      data.issueIdentification || '',
      data.properResolution || '',
      data.productSales || '',
      data.accuracy || '',
      data.workflow || '',
      data.clarity || '',
      data.tone || '',
      data.efficientTroubleshootingMiss || '',
      data.zeroTolerance || '',
      data.notes || ''
    ]);

    return jsonResponse_({ status: 'success' });
  }

  const sessionKey = data.sessionId;
  let targetRow = null;
  const lastRow = sheet.getLastRow();

  for (let i = 2; i <= lastRow; i++) {
    const existingSessionId = sheet.getRange(i, 4).getValue();
    if (existingSessionId && existingSessionId.toString() === sessionKey) {
      targetRow = i;
      break;
    }
  }

  if (targetRow === null) {
    targetRow = lastRow + 1;
    sheet.getRange(targetRow, 1).setValue(String(data.timestampEST || ''));
    sheet.getRange(targetRow, 2).setValue(data.agentUsername || '');
    sheet.getRange(targetRow, 3).setValue(data.scenario || '');
    sheet.getRange(targetRow, 4).setValue(data.sessionId || '');
  }

  let messageColumn = 5;
  const possibleColumns = [5, 8];
  for (let i = 0; i < possibleColumns.length; i++) {
    const col = possibleColumns[i];
    const customerMsgValue = sheet.getRange(targetRow, col).getValue();
    if (!customerMsgValue) {
      messageColumn = col;
      break;
    }
  }

  if (messageColumn === 5) {
    const firstMsgValue = sheet.getRange(targetRow, 5).getValue();
    if (firstMsgValue) messageColumn = 8;
  }

  sheet.getRange(targetRow, messageColumn).setValue(data.customerMessage || '');
  sheet.getRange(targetRow, messageColumn + 1).setValue(data.agentResponse || '');
  sheet.getRange(targetRow, messageColumn + 2).setValue(data.sendTime || '');

  const messageNumber = messageColumn === 5 ? 1 : 2;
  return jsonResponse_({
    status: 'success',
    message: 'Data saved successfully',
    row: targetRow,
    messageNumber: messageNumber,
    sessionId: sessionKey
  });
}

function getOrTopUpQueue_(email, appBaseUrl) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const assignmentsSheet = getOrCreateSheet_(spreadsheet, ASSIGNMENTS_SHEET, ASSIGNMENTS_HEADERS);
  const poolSheet = getOrCreateSheet_(spreadsheet, POOL_SHEET, POOL_HEADERS);

  const now = nowIso_();
  const baseUrl = resolveAppBaseUrl_(appBaseUrl);

  const assignmentsValues = getSheetDataRows_(assignmentsSheet, ASSIGNMENTS_HEADERS.length);
  const activeAssignments = [];

  for (let i = 0; i < assignmentsValues.length; i++) {
    const row = assignmentsValues[i];
    const assigneeEmail = normalizeEmail_(row[1]);
    const status = String(row[2] || '').toUpperCase();
    if (assigneeEmail === email && ACTIVE_ASSIGNMENT_STATUSES[status]) {
      activeAssignments.push(rowToAssignmentObject_(row));
    }
  }

  const limit = 5;
  const needed = Math.max(0, limit - activeAssignments.length);

  if (needed > 0) {
    const poolValues = getSheetDataRows_(poolSheet, POOL_HEADERS.length);
    const availableIndexes = [];

    for (let i = 0; i < poolValues.length; i++) {
      const poolStatus = String(poolValues[i][1] || '').toUpperCase();
      if (!poolStatus || poolStatus === 'AVAILABLE') {
        availableIndexes.push(i);
        if (availableIndexes.length >= needed) break;
      }
    }

    const newRows = [];
    const selectedPoolIndexes = [];

    for (let i = 0; i < availableIndexes.length; i++) {
      const poolIdx = availableIndexes[i];
      const sendId = String(poolValues[poolIdx][0] || '').trim();
      if (!sendId) continue;

      selectedPoolIndexes.push(poolIdx);
      newRows.push([
        sendId,
        email,
        'ASSIGNED',
        Utilities.getUuid(),
        now,
        now,
        '',
        generateOpaqueToken_(),
        generateOpaqueToken_(),
        '',
        ''
      ]);
    }

    if (newRows.length > 0) {
      const startRow = assignmentsSheet.getLastRow() + 1;
      assignmentsSheet.getRange(startRow, 1, newRows.length, ASSIGNMENTS_HEADERS.length).setValues(newRows);

      for (let i = 0; i < selectedPoolIndexes.length; i++) {
        poolValues[selectedPoolIndexes[i]][1] = 'ASSIGNED';
      }

      const poolStart = 2;
      const poolLast = poolValues.length + 1;
      if (poolLast >= poolStart) {
        const statusColumn = poolValues.map(r => [r[1]]);
        poolSheet.getRange(poolStart, 2, statusColumn.length, 1).setValues(statusColumn);
      }

      for (let i = 0; i < newRows.length; i++) {
        activeAssignments.push(rowToAssignmentObject_(newRows[i]));
      }
    }
  }

  activeAssignments.sort(function(a, b) {
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });

  return activeAssignments.slice(0, 5).map(function(a) {
    return {
      assignment_id: a.assignment_id,
      send_id: a.send_id,
      status: a.status,
      edit_url: buildAssignmentUrl_(baseUrl, a.assignment_id, a.editor_token, 'edit'),
      view_url: buildAssignmentUrl_(baseUrl, a.assignment_id, a.viewer_token, 'view')
    };
  });
}

function getAssignmentById_(assignmentId) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(spreadsheet, ASSIGNMENTS_SHEET, ASSIGNMENTS_HEADERS);
  const rows = getSheetDataRows_(sheet, ASSIGNMENTS_HEADERS.length);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[3] || '') === String(assignmentId)) {
      const assignment = rowToAssignmentObject_(row);
      assignment._sheetRowNumber = i + 2;
      return assignment;
    }
  }

  return null;
}

function markAssignmentDone_(assignmentId, token) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const assignmentsSheet = getOrCreateSheet_(spreadsheet, ASSIGNMENTS_SHEET, ASSIGNMENTS_HEADERS);
  const poolSheet = getOrCreateSheet_(spreadsheet, POOL_SHEET, POOL_HEADERS);

  const rows = getSheetDataRows_(assignmentsSheet, ASSIGNMENTS_HEADERS.length);
  let rowIndex = -1;
  let row = null;

  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][3] || '') === String(assignmentId)) {
      rowIndex = i;
      row = rows[i];
      break;
    }
  }

  if (rowIndex < 0) return { error: 'Assignment not found' };

  if (String(row[7] || '') !== String(token || '')) {
    return { error: 'Unauthorized: editor token required' };
  }

  const now = nowIso_();
  row[2] = 'DONE';
  row[5] = now;
  row[6] = now;

  assignmentsSheet.getRange(rowIndex + 2, 3, 1, 4).setValues([[row[2], row[3], row[4], row[5]]]);
  assignmentsSheet.getRange(rowIndex + 2, 7).setValue(row[6]);

  const sendId = String(row[0] || '');
  const poolValues = getSheetDataRows_(poolSheet, POOL_HEADERS.length);
  for (let i = 0; i < poolValues.length; i++) {
    if (String(poolValues[i][0] || '') === sendId) {
      poolValues[i][1] = 'DONE';
      poolSheet.getRange(i + 2, 2).setValue('DONE');
      break;
    }
  }

  return { assignee_email: normalizeEmail_(row[1]) };
}

function updateAssignmentDraft_(assignmentId, token, formStateJson, internalNote) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet_(spreadsheet, ASSIGNMENTS_SHEET, ASSIGNMENTS_HEADERS);
  const rows = getSheetDataRows_(sheet, ASSIGNMENTS_HEADERS.length);

  let rowIndex = -1;
  let row = null;

  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][3] || '') === String(assignmentId)) {
      rowIndex = i;
      row = rows[i];
      break;
    }
  }

  if (rowIndex < 0) return { error: 'Assignment not found' };
  if (String(row[7] || '') !== String(token || '')) {
    return { error: 'Unauthorized: editor token required' };
  }

  row[9] = stringifyMaybe_(formStateJson);
  row[10] = internalNote != null ? String(internalNote) : '';
  row[5] = nowIso_();

  const currentStatus = String(row[2] || '').toUpperCase();
  if (currentStatus === 'ASSIGNED' || currentStatus === 'IN_PROGRESS') {
    row[2] = 'IN_PROGRESS';
  }

  sheet.getRange(rowIndex + 2, 3, 1, 9).setValues([[
    row[2],
    row[3],
    row[4],
    row[5],
    row[6],
    row[7],
    row[8],
    row[9],
    row[10]
  ]]);

  return { ok: true };
}

function rowToAssignmentObject_(row) {
  return {
    send_id: String(row[0] || ''),
    assignee_email: normalizeEmail_(row[1]),
    status: String(row[2] || ''),
    assignment_id: String(row[3] || ''),
    created_at: String(row[4] || ''),
    updated_at: String(row[5] || ''),
    done_at: String(row[6] || ''),
    editor_token: String(row[7] || ''),
    viewer_token: String(row[8] || ''),
    form_state_json: String(row[9] || ''),
    internal_note: String(row[10] || '')
  };
}

function tokenRoleForAssignment_(assignment, token) {
  const rawToken = String(token || '');
  if (!rawToken) return '';
  if (rawToken === String(assignment.editor_token || '')) return 'editor';
  if (rawToken === String(assignment.viewer_token || '')) return 'viewer';
  return '';
}

function getOrCreateSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    let mismatch = false;
    for (let i = 0; i < headers.length; i++) {
      if (String(existingHeaders[i] || '') !== String(headers[i])) {
        mismatch = true;
        break;
      }
    }
    if (mismatch) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  return sheet;
}

function getSheetDataRows_(sheet, expectedCols) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, expectedCols).getValues();
}

function generateOpaqueToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function resolveAppBaseUrl_(appBaseUrl) {
  const raw = String(appBaseUrl || '').trim();
  if (raw) return raw;
  return 'app.html';
}

function buildAssignmentUrl_(baseUrl, assignmentId, token, mode) {
  if (!baseUrl) return '';
  const hasQuery = baseUrl.indexOf('?') >= 0;
  const params = [
    'aid=' + encodeURIComponent(String(assignmentId || '')),
    'token=' + encodeURIComponent(String(token || '')),
    'mode=' + encodeURIComponent(String(mode || 'edit'))
  ];
  return baseUrl + (hasQuery ? '&' : '?') + params.join('&');
}

function getRequestAction_(e, body) {
  const fromQuery = getParam_(e, 'action');
  if (fromQuery) return fromQuery;
  return body && body.action ? String(body.action) : '';
}

function getParam_(e, key) {
  if (!e || !e.parameter) return '';
  const raw = e.parameter[key];
  return raw == null ? '' : String(raw);
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function nowIso_() {
  return new Date().toISOString();
}

function stringifyMaybe_(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeAppendRow(targetSheet, values) {
  if (!targetSheet || !values) return;
  const nextRow = targetSheet.getLastRow() + 1;
  const numCols = values.length;
  targetSheet.getRange(nextRow, 1, 1, numCols).setValues([values]);
}

function testFunction() {
  const testData = {
    timestampEST: '07/31/2025',
    agentUsername: 'test_agent',
    scenario: 'Scenario 1',
    customerMessage: 'Test customer message',
    agentResponse: 'Test agent response',
    sessionId: '1_test_session_123',
    sendTime: '02:30'
  };

  const testEvent = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };

  const result = doPost(testEvent);
  console.log('Test result:', result.getContent());
}
