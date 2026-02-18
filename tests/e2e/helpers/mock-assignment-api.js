function createMockAssignmentApi(options = {}) {
  const baseAppUrl = String(options.baseAppUrl || 'http://127.0.0.1:4173/app.html');
  const sessionId = String(options.sessionId || 'pw_session_1');

  const assignments = [
    {
      assignment_id: 'aid-1',
      send_id: '019bebf7-17aa-48de-f000-0000f506a3fe',
      status: 'ASSIGNED',
      token: 'token-aid-1',
      form_state_json: '',
      internal_note: '',
    },
    {
      assignment_id: 'aid-2',
      send_id: '019bd3ae-2a24-478d-f000-0000efb67321',
      status: 'ASSIGNED',
      token: 'token-aid-2',
      form_state_json: '',
      internal_note: '',
    },
    {
      assignment_id: 'aid-3',
      send_id: '019bdd15-7512-4e9e-f000-0000d6364a39',
      status: 'ASSIGNED',
      token: 'token-aid-3',
      form_state_json: '',
      internal_note: '',
    },
  ];

  const state = {
    submitted_count: 0,
    queueCalls: 0,
    getAssignmentCalls: 0,
    saveDraftCalls: 0,
    doneCalls: 0,
    evaluationCalls: 0,
    heartbeatCalls: 0,
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
      assignment.form_state_json = String(payload.form_state_json || '');
      assignment.internal_note = String(payload.internal_note || '');
      assignment.status = 'IN_PROGRESS';
      return fulfillJson(route, { ok: true, session: buildSessionPayload() });
    }

    if (action === 'done') {
      state.doneCalls += 1;
      const assignment = findAssignment(payload.assignment_id);
      if (!assignment) return fulfillJson(route, { error: 'Assignment not found' });
      if (String(payload.token || '') !== String(assignment.token || '')) {
        return fulfillJson(route, { error: 'Unauthorized: editor token required' });
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
  };
}

module.exports = { createMockAssignmentApi };
