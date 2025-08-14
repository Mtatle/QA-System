function doPost(e) {
  try {
    // Check if we have proper POST data
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No POST data received. This function should be called via HTTP POST, not run directly.');
    }
    
    // Parse the incoming data
    const data = JSON.parse(e.postData.contents);
    
    const spreadsheetId = '16WVs50b01sCwRyHI_4NHjxAXMKWNDzFAO-s2zSbhBoE'; 
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getActiveSheet();

    // Handle session login/logout events to a dedicated tab
    if (data && data.eventType && (data.eventType === 'sessionLogin' || data.eventType === 'sessionLogout')) {
      const logsSheetName = 'Session Logs';
      let logsSheet = spreadsheet.getSheetByName(logsSheetName);
      if (!logsSheet) {
        logsSheet = spreadsheet.insertSheet(logsSheetName);
        logsSheet.appendRow(['Date (EST)', 'Agent Name', 'Agent Email', 'Event', 'Global Session ID', 'Login Method', 'Login At', 'Logout At', 'Duration (mins)']);
      }

      const sessionId = data.sessionId || '';
      if (data.eventType === 'sessionLogin') {
        const row = [
          data.loginAt || '',
          data.agentUsername || '',
          data.agentEmail || '',
          'login',
          sessionId,
          data.loginMethod || '',
          data.loginAt || '',
          '',
          ''
        ];
        logsSheet.appendRow(row);
      } else if (data.eventType === 'sessionLogout') {
        const lastRow = logsSheet.getLastRow();
        // Try to find matching login row by Session ID, starting from bottom
        for (let i = lastRow; i >= 2; i--) {
          const existingSessionId = logsSheet.getRange(i, 5).getValue(); // col 5: Global Session ID
          const eventCell = logsSheet.getRange(i, 4).getValue(); // col 4: Event
          if (existingSessionId && existingSessionId.toString() === sessionId && eventCell === 'login') {
            // Fill logout time and duration
            logsSheet.getRange(i, 8).setValue(data.logoutAt || ''); // Logout At
            // Compute duration if we have ms
            const loginAtMsCell = logsSheet.getRange(i, 1).getValue();
            // We stored date string; also keep ms in a hidden note via loginAtMs if provided
            // Prefer computing from provided ms values if present
            let durationMins = '';
            if (typeof data.logoutAtMs === 'number' && data.logoutAtMs) {
              // Search upward for the login row with this sessionId and read the approximate time from sheet (cannot store ms precisely in sheet without separate column)
              // If we had loginAtMs, calculate duration (we didn't store it as a value; accept leaving blank)
            }
            // As a simple approach: leave duration empty or compute based on current time difference if needed.
            logsSheet.getRange(i, 9).setValue(durationMins);
            return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
          }
        }
        // If no matching login found, append a standalone logout row
        logsSheet.appendRow([
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
        return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Create a unique session key using session ID
    const sessionKey = data.sessionId;
    const scenario = data.scenario;
    let targetRow = null;
    const lastRow = sheet.getLastRow();
    
    // Search for existing row with same session ID (sessionId already includes scenario)
    for (let i = 2; i <= lastRow; i++) {
      const existingSessionId = sheet.getRange(i, 4).getValue();
      if (existingSessionId && existingSessionId.toString() === sessionKey) {
        targetRow = i;
        break;
      }
    }
    
    if (targetRow === null) {
      // Create new row - set basic info one cell at a time to avoid resizing
      targetRow = lastRow + 1;
      
      // Set the date (column A), username (B), scenario (C), session ID (D)
      // Ensure the date is stored as text, not parsed as a date
      sheet.getRange(targetRow, 1).setValue(data.timestampEST.toString());
      sheet.getRange(targetRow, 2).setValue(data.agentUsername);
      sheet.getRange(targetRow, 3).setValue(data.scenario);
      sheet.getRange(targetRow, 4).setValue(data.sessionId);
    }
    
    // Find the next available message pair columns 
    // Column 5: Customer Message 1, Column 6: Agent Response 1, Column 7: Send Time 1
    // Column 8: Customer Message 2, Column 9: Agent Response 2, Column 10: Send Time 2
    let messageColumn = 5; // Start with Customer Message 1 (column E)
    
    // Find first empty customer message column (only check columns 5 and 8)
    const possibleColumns = [5, 8]; // Only Customer Message 1 and Customer Message 2
    for (let col of possibleColumns) {
      const customerMsgValue = sheet.getRange(targetRow, col).getValue();
      if (!customerMsgValue || customerMsgValue === '' || customerMsgValue === null) {
        messageColumn = col;
        break;
      }
    }
    
    // If both slots are full, overwrite the last one (column 8)
    if (messageColumn === 5) {
      const firstMsgValue = sheet.getRange(targetRow, 5).getValue();
      if (firstMsgValue && firstMsgValue !== '' && firstMsgValue !== null) {
        messageColumn = 8; // Use second slot
      }
    }
    
    // Set the customer message, agent response, and send time
    sheet.getRange(targetRow, messageColumn).setValue(data.customerMessage);     // Customer Message X
    sheet.getRange(targetRow, messageColumn + 1).setValue(data.agentResponse);   // Agent Response X  
    sheet.getRange(targetRow, messageColumn + 2).setValue(data.sendTime);        // Send Time X
    
    // Calculate message number for response
    const messageNumber = messageColumn === 5 ? 1 : 2;
    
    // Return success response
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Data saved successfully',
        row: targetRow,
        messageNumber: messageNumber,
        sessionId: sessionKey
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error in doPost:', error);
    
    // Return error response
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  // Handle GET requests (optional - for testing)
  return ContentService
    .createTextOutput('Agent Training Data Collector is running!')
    .setMimeType(ContentService.MimeType.TEXT);
}

// Test function to verify the script works
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
