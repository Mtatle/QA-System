const fs = require('fs');
const path = require('path');

function loadRuntimeSendIds(fallback = []) {
  try {
    const indexPath = path.resolve(__dirname, '../../../data/scenarios/index.json');
    const indexPayload = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const fromById = indexPayload && indexPayload.byId ? Object.keys(indexPayload.byId) : [];
    const ids = fromById.map((v) => String(v || '').trim()).filter(Boolean);
    if (ids.length) return ids;
  } catch (_) {
    // Ignore file read/index parse errors and fall back to static ids.
  }
  return Array.isArray(fallback) ? fallback.map((v) => String(v || '').trim()).filter(Boolean) : [];
}

function createMockAssignmentApi(options = {}) {
  const baseAppUrl = String(options.baseAppUrl || 'http://127.0.0.1:4173/app.html');
  const sessionId = String(options.sessionId || 'pw_session_1');
  const assigneeEmail = String(options.assigneeEmail || 'playwright@example.com')
    .trim()
    .toLowerCase();
  const saveDraftDelaySequence = Array.isArray(options.saveDraftDelaySequence)
    ? options.saveDraftDelaySequence.map((value) => Math.max(0, Number(value) || 0))
    : [];
  const regradeDelayMs = Math.max(0, Number(options.regradeDelayMs) || 0);
  const doneErrorsByAssignmentId =
    options.doneErrorsByAssignmentId && typeof options.doneErrorsByAssignmentId === 'object'
      ? options.doneErrorsByAssignmentId
      : {};

  const fallbackSendIds = [
    '019bebf7-17aa-48de-f000-0000f506a3fe',
    '019bd3ae-2a24-478d-f000-0000efb67321',
    '019bdd15-7512-4e9e-f000-0000d6364a39',
    '019bd742-baf8-425f-f000-00003e7e7b41',
  ];
  const runtimeSendIds = loadRuntimeSendIds(fallbackSendIds);
  const selectedSendIds = (
    Array.isArray(options.selectedSendIds) && options.selectedSendIds.length
      ? options.selectedSendIds
      : runtimeSendIds
  )
    .slice(0, 3)
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  while (selectedSendIds.length < 3 && fallbackSendIds[selectedSendIds.length]) {
    selectedSendIds.push(fallbackSendIds[selectedSendIds.length]);
  }
  const assignments = selectedSendIds.map((sendId, index) => ({
    assignment_id: `aid-${index + 1}`,
    send_id: sendId,
    status: 'ASSIGNED',
    token: `token-aid-${index + 1}`,
    form_state_json: '',
    internal_note: '',
    assignee_email: assigneeEmail,
    session_id: sessionId,
  }));
  const defaultCompletedSendId =
    runtimeSendIds.find((sendId) => !selectedSendIds.includes(sendId)) || '';
  const completedAssignmentsInput = Array.isArray(options.completedAssignments)
    ? options.completedAssignments
    : options.includeDefaultCompletedAssignment && defaultCompletedSendId
      ? [
          {
            send_id: defaultCompletedSendId,
            form_state_json: '',
            internal_note: '',
            assignee_email: assigneeEmail,
          },
        ]
      : [];
  const completedAssignments = completedAssignmentsInput
    .map((entry, index) => {
      const source =
        entry && typeof entry === 'object' ? entry : { send_id: String(entry || '').trim() };
      const sendId = String(source.send_id || '').trim();
      if (!sendId) return null;
      const assignmentId = String(source.assignment_id || `aid-done-${index + 1}`).trim();
      return {
        assignment_id: assignmentId,
        send_id: sendId,
        status: 'DONE',
        token: String(source.token || `token-${assignmentId}`),
        form_state_json: String(source.form_state_json || ''),
        internal_note: String(source.internal_note || ''),
        assignee_email: String(source.assignee_email || assigneeEmail)
          .trim()
          .toLowerCase(),
        session_id: String(source.session_id || '').trim(),
        done_at: String(source.done_at || `2025-01-0${index + 1}T12:00:00.000Z`),
      };
    })
    .filter(Boolean);
  assignments.push(
    ...completedAssignments.map((assignment) => ({
      assignment_id: assignment.assignment_id,
      send_id: assignment.send_id,
      status: assignment.status,
      token: assignment.token,
      form_state_json: assignment.form_state_json,
      internal_note: assignment.internal_note,
      assignee_email: assignment.assignee_email,
      session_id: assignment.session_id,
      done_at: assignment.done_at,
    }))
  );

  const state = {
    submitted_count: 0,
    queueCalls: 0,
    getAssignmentCalls: 0,
    saveDraftCalls: 0,
    doneCalls: 0,
    evaluationCalls: 0,
    heartbeatCalls: 0,
    regradeCalls: 0,
    lastEvaluationPayload: null,
    lastRegradePayload: null,
    draftPayloads: [],
    dataRows: Array.isArray(options.initialDataRows)
      ? options.initialDataRows.map((row) => ({
          assignmentId: String((row && (row.assignmentId || row.assignment_id)) || '').trim(),
          messageId: String((row && (row.messageId || row.message_id)) || '').trim(),
          notes: String((row && row.notes) || ''),
        }))
      : [],
  };

  const activeStatuses = new Set(['ASSIGNED', 'IN_PROGRESS']);

  function buildSessionPayload() {
    return {
      session_id: sessionId,
      state: 'ACTIVE',
      submitted_count: state.submitted_count,
      cap: 20,
      session_complete: false,
    };
  }

  function buildAssignmentUrls(assignment) {
    const aid = encodeURIComponent(String(assignment.assignment_id || ''));
    const token = encodeURIComponent(String(assignment.token || ''));
    return {
      edit_url: `${baseAppUrl}?aid=${aid}&token=${token}&mode=edit`,
      view_url: `${baseAppUrl}?aid=${aid}&token=${token}&mode=view`,
    };
  }

  function listActiveAssignments() {
    return assignments
      .filter((assignment) => activeStatuses.has(String(assignment.status || '').toUpperCase()))
      .map((assignment) => {
        const urls = buildAssignmentUrls(assignment);
        return {
          assignment_id: assignment.assignment_id,
          send_id: assignment.send_id,
          status: assignment.status,
          edit_url: urls.edit_url,
          view_url: urls.view_url,
        };
      });
  }

  function findAssignment(assignmentId) {
    const id = String(assignmentId || '');
    return assignments.find((assignment) => String(assignment.assignment_id || '') === id) || null;
  }

  function findLatestCompletedAssignmentBySendId(sendId, email) {
    const targetSendId = String(sendId || '').trim();
    const targetEmail = String(email || '')
      .trim()
      .toLowerCase();
    let ownedMatch = null;
    let differentAuditorMatch = null;
    for (let i = assignments.length - 1; i >= 0; i -= 1) {
      const assignment = assignments[i];
      if (String(assignment.send_id || '').trim() !== targetSendId) continue;
      if (String(assignment.status || '').toUpperCase() !== 'DONE') continue;
      if (
        String(assignment.assignee_email || '')
          .trim()
          .toLowerCase() === targetEmail
      ) {
        ownedMatch = assignment;
        break;
      }
      differentAuditorMatch = assignment;
    }
    return {
      ownedMatch,
      differentAuditorMatch,
    };
  }

  function deleteDataRowsMatching({ assignmentId, messageId }) {
    const targetAssignmentId = String(assignmentId || '').trim();
    const targetMessageId = String(messageId || '').trim();
    const nextRows = state.dataRows.filter((row) => {
      const matchesAssignment =
        targetAssignmentId && String(row.assignmentId || '').trim() === targetAssignmentId;
      const matchesMessage =
        targetMessageId && String(row.messageId || '').trim() === targetMessageId;
      return !(matchesAssignment || matchesMessage);
    });
    const deletedCount = Math.max(0, state.dataRows.length - nextRows.length);
    state.dataRows = nextRows;
    return deletedCount;
  }

  function jsonHeaders() {
    return {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    };
  }

  async function fulfillJson(route, payload, status = 200) {
    await route.fulfill({
      status,
      headers: jsonHeaders(),
      body: JSON.stringify(payload || {}),
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  async function handleGet(route, url) {
    const action = String(url.searchParams.get('action') || '');
    if (action === 'queue') {
      state.queueCalls += 1;
      return fulfillJson(route, {
        assignments: listActiveAssignments().slice(0, 5),
        session: buildSessionPayload(),
      });
    }
    if (action === 'getAssignment') {
      state.getAssignmentCalls += 1;
      const assignmentId = String(url.searchParams.get('assignment_id') || '');
      const token = String(url.searchParams.get('token') || '');
      const assignment = findAssignment(assignmentId);
      if (!assignment) return fulfillJson(route, { error: 'Assignment not found' });
      if (String(assignment.token || '') !== token)
        return fulfillJson(route, { error: 'Unauthorized token' });
      return fulfillJson(route, {
        assignment: {
          assignment_id: assignment.assignment_id,
          send_id: assignment.send_id,
          status: assignment.status,
          form_state_json: assignment.form_state_json || '',
          internal_note: assignment.internal_note || '',
          role: 'editor',
        },
        session: buildSessionPayload(),
      });
    }
    if (action === 'getSnapshot') {
      return fulfillJson(route, { error: 'Snapshot not configured in this mock' }, 404);
    }
    return fulfillJson(route, { status: 'ok' });
  }

  async function handlePost(route, url, bodyRaw) {
    const action = String(url.searchParams.get('action') || '');
    let payload = {};
    try {
      payload = bodyRaw ? JSON.parse(bodyRaw) : {};
    } catch (_) {
      payload = {};
    }

    if (!action) {
      if (String(payload.eventType || '') === 'evaluationFormSubmission') {
        state.evaluationCalls += 1;
        state.lastEvaluationPayload = payload;
        deleteDataRowsMatching({
          assignmentId: payload.assignmentId || payload.assignment_id,
          messageId: payload.messageId || payload.message_id,
        });
        state.dataRows.push({
          assignmentId: String(payload.assignmentId || payload.assignment_id || '').trim(),
          messageId: String(payload.messageId || payload.message_id || '').trim(),
          notes: String(payload.notes || ''),
        });
      }
      return fulfillJson(route, { status: 'success', message: 'ok' });
    }

    if (action === 'heartbeat') {
      state.heartbeatCalls += 1;
      return fulfillJson(route, {
        ok: true,
        session: buildSessionPayload(),
      });
    }

    if (action === 'saveDraft') {
      state.saveDraftCalls += 1;
      const assignment = findAssignment(payload.assignment_id);
      if (!assignment) return fulfillJson(route, { error: 'Assignment not found' });
      if (String(payload.token || '') !== String(assignment.token || '')) {
        return fulfillJson(route, { error: 'Unauthorized: editor token required' });
      }
      state.draftPayloads.push({
        assignment_id: String(payload.assignment_id || ''),
        internal_note: String(payload.internal_note || ''),
        form_state_json: String(payload.form_state_json || ''),
      });
      if (saveDraftDelaySequence.length) {
        await delay(saveDraftDelaySequence.shift());
      }
      assignment.form_state_json = String(payload.form_state_json || '');
      assignment.internal_note = String(payload.internal_note || '');
      assignment.status = 'IN_PROGRESS';
      return fulfillJson(route, { ok: true, session: buildSessionPayload() });
    }

    if (action === 'regradeBySendId') {
      state.regradeCalls += 1;
      state.lastRegradePayload = payload;
      const sendId = String(payload.send_id || '').trim();
      const email = String(payload.email || '')
        .trim()
        .toLowerCase();
      if (!sendId || !email || String(payload.session_id || '').trim() !== sessionId) {
        return fulfillJson(route, { error: 'Missing send_id, email, or session_id' });
      }
      const hasActiveAssignment = assignments.some(
        (assignment) =>
          String(assignment.send_id || '').trim() === sendId &&
          activeStatuses.has(String(assignment.status || '').toUpperCase())
      );
      if (hasActiveAssignment) {
        return fulfillJson(route, { error: 'This message ID already has an active assignment.' });
      }

      const { ownedMatch, differentAuditorMatch } = findLatestCompletedAssignmentBySendId(
        sendId,
        email
      );
      if (!ownedMatch) {
        return fulfillJson(route, {
          error: differentAuditorMatch
            ? 'This message ID was audited by a different auditor.'
            : 'No completed audit found for this message ID.',
        });
      }

      if (regradeDelayMs > 0) {
        await delay(regradeDelayMs);
      }

      const deletedRows = deleteDataRowsMatching({ messageId: sendId });
      ownedMatch.status = 'IN_PROGRESS';
      ownedMatch.session_id = sessionId;
      ownedMatch.assignee_email = email;
      ownedMatch.done_at = '';

      const urls = buildAssignmentUrls(ownedMatch);
      const activeAssignments = listActiveAssignments();
      const reopenedAssignment = {
        assignment_id: ownedMatch.assignment_id,
        send_id: ownedMatch.send_id,
        status: ownedMatch.status,
        edit_url: urls.edit_url,
        view_url: urls.view_url,
      };
      const remainingAssignments = activeAssignments.filter(
        (assignment) =>
          String(assignment.assignment_id || '').trim() !==
          String(ownedMatch.assignment_id || '').trim()
      );
      return fulfillJson(route, {
        ok: true,
        deleted_rows: deletedRows,
        assignment: reopenedAssignment,
        assignments: [reopenedAssignment].concat(remainingAssignments),
        session: buildSessionPayload(),
      });
    }

    if (action === 'done') {
      state.doneCalls += 1;
      const assignment = findAssignment(payload.assignment_id);
      if (!assignment) return fulfillJson(route, { error: 'Assignment not found' });
      if (String(payload.token || '') !== String(assignment.token || '')) {
        return fulfillJson(route, { error: 'Unauthorized: editor token required' });
      }
      const configuredError = String(
        doneErrorsByAssignmentId[String(payload.assignment_id || '')] || ''
      ).trim();
      if (configuredError) {
        return fulfillJson(route, { error: configuredError });
      }
      const currentStatus = String(assignment.status || '').toUpperCase();
      if (!activeStatuses.has(currentStatus)) {
        return fulfillJson(route, { error: 'Assignment is not in an active state' });
      }
      assignment.status = 'DONE';
      state.submitted_count += 1;
      return fulfillJson(route, {
        assignments: listActiveAssignments().slice(0, 5),
        session: buildSessionPayload(),
      });
    }

    if (action === 'releaseSession') {
      return fulfillJson(route, {
        ok: true,
        released_count: 0,
        session: buildSessionPayload(),
      });
    }

    return fulfillJson(route, { ok: true, session: buildSessionPayload() });
  }

  async function routeHandler(route) {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.endsWith('/exec')) {
      return route.continue();
    }

    const method = String(request.method() || 'GET').toUpperCase();
    if (method === 'GET') return handleGet(route, url);

    const bodyRaw = request.postData() || '';
    return handlePost(route, url, bodyRaw);
  }

  return {
    state,
    routeHandler,
    getAssignment(assignmentId) {
      const assignment = findAssignment(assignmentId);
      return assignment ? { ...assignment } : null;
    },
    getCompletedAssignments() {
      return assignments
        .filter((assignment) => String(assignment.status || '').toUpperCase() === 'DONE')
        .map((assignment) => ({ ...assignment }));
    },
    getDataRows() {
      return state.dataRows.map((row) => ({ ...row }));
    },
  };
}

module.exports = { createMockAssignmentApi };
