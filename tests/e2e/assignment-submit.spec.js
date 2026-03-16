const { test, expect } = require('@playwright/test');
const { createMockAssignmentApi } = require('./helpers/mock-assignment-api');

test.describe('Assignment submit flow', () => {
  test('submits in background and advances to next assignment', async ({ page }) => {
    const api = createMockAssignmentApi();

    await page.addInitScript(() => {
      localStorage.setItem('agentName', 'Playwright QA');
      localStorage.setItem('agentEmail', 'playwright@example.com');
      localStorage.setItem('loginMethod', 'username');
      localStorage.setItem('assignmentSessionId', 'pw_session_1');
    });

    await page.route('**/exec**', async (route) => api.routeHandler(route));
    await page.goto('/app.html');

    await expect
      .poll(() => {
        const currentUrl = new URL(page.url());
        return String(currentUrl.searchParams.get('aid') || '').trim();
      })
      .toBe('aid-1');
    await page.fill('#notes', 'Playwright submit smoke note');
    await page.click('#formSubmitBtn');

    await expect
      .poll(
        () => {
          const currentUrl = new URL(page.url());
          return String(currentUrl.searchParams.get('aid') || '').trim();
        },
        { timeout: 10000 }
      )
      .toBe('aid-2');

    await expect.poll(() => api.state.doneCalls, { timeout: 10000 }).toBeGreaterThan(0);
    await expect.poll(() => api.state.evaluationCalls, { timeout: 10000 }).toBeGreaterThan(0);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          form: localStorage.getItem('customFormState_assignment_aid-1'),
          notes: localStorage.getItem('internalNotes_assignment_aid-1'),
        }))
      )
      .toEqual({ form: null, notes: null });

    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname.endsWith('/app.html')).toBeTruthy();
    expect(currentUrl.searchParams.has('issue_identification')).toBeFalsy();
    expect(currentUrl.searchParams.has('notes')).toBeFalsy();
  });

  test('keeps delayed draft saves attached to the assignment that scheduled them', async ({
    page,
  }) => {
    const api = createMockAssignmentApi();

    await page.addInitScript(() => {
      localStorage.setItem('agentName', 'Playwright QA');
      localStorage.setItem('agentEmail', 'playwright@example.com');
      localStorage.setItem('loginMethod', 'username');
      localStorage.setItem('assignmentSessionId', 'pw_session_1');
    });

    await page.route('**/exec**', async (route) => api.routeHandler(route));
    await page.goto('/app.html');

    await expect
      .poll(() => {
        const currentUrl = new URL(page.url());
        return String(currentUrl.searchParams.get('aid') || '').trim();
      })
      .toBe('aid-1');

    await page.fill('#notes', 'Assignment one draft note');
    await page.click('#nextConversationBtn');

    await expect
      .poll(() => {
        const currentUrl = new URL(page.url());
        return String(currentUrl.searchParams.get('aid') || '').trim();
      })
      .toBe('aid-2');

    await expect.poll(() => api.state.saveDraftCalls, { timeout: 10000 }).toBeGreaterThan(0);

    const firstDraftState = JSON.parse(api.getAssignment('aid-1').form_state_json || '{}');
    const secondDraftState = JSON.parse(api.getAssignment('aid-2').form_state_json || '{}');

    expect(firstDraftState.notes).toBe('Assignment one draft note');
    expect(secondDraftState.notes || '').not.toBe('Assignment one draft note');
  });

  test('latest draft wins when an older save resolves later', async ({ page }) => {
    const api = createMockAssignmentApi({ saveDraftDelaySequence: [2000, 0] });

    await page.addInitScript(() => {
      localStorage.setItem('agentName', 'Playwright QA');
      localStorage.setItem('agentEmail', 'playwright@example.com');
      localStorage.setItem('loginMethod', 'username');
      localStorage.setItem('assignmentSessionId', 'pw_session_1');
    });

    await page.route('**/exec**', async (route) => api.routeHandler(route));
    await page.goto('/app.html');

    await expect
      .poll(() => {
        const currentUrl = new URL(page.url());
        return String(currentUrl.searchParams.get('aid') || '').trim();
      })
      .toBe('aid-1');

    await page.fill('#notes', 'First draft value');
    await page.waitForTimeout(1250);
    await page.fill('#notes', 'Second draft value');

    await expect.poll(() => api.state.saveDraftCalls, { timeout: 10000 }).toBe(2);
    await expect
      .poll(
        () => {
          const assignment = api.getAssignment('aid-1');
          const savedState = JSON.parse((assignment && assignment.form_state_json) || '{}');
          return String(savedState.notes || '');
        },
        { timeout: 10000 }
      )
      .toBe('Second draft value');
  });

  test('locks previous/next controls and arrow shortcuts while submit transition is in progress', async ({
    page,
  }) => {
    const api = createMockAssignmentApi();

    await page.addInitScript(() => {
      localStorage.setItem('agentName', 'Playwright QA');
      localStorage.setItem('agentEmail', 'playwright@example.com');
      localStorage.setItem('loginMethod', 'username');
      localStorage.setItem('assignmentSessionId', 'pw_session_1');
    });

    await page.route('**/exec**', async (route) => api.routeHandler(route));
    await page.goto('/app.html');

    await expect
      .poll(() => {
        const currentUrl = new URL(page.url());
        return String(currentUrl.searchParams.get('aid') || '').trim();
      })
      .toBe('aid-1');

    await page.fill('#notes', 'Submit lock guardrail validation');
    await page.click('#formSubmitBtn');

    await expect(page.locator('#previousConversationBtn')).toBeDisabled();
    await expect(page.locator('#nextConversationBtn')).toBeDisabled();

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);

    {
      const currentUrl = new URL(page.url());
      expect(String(currentUrl.searchParams.get('aid') || '').trim()).toBe('aid-1');
    }

    await expect
      .poll(
        () => {
          const currentUrl = new URL(page.url());
          return String(currentUrl.searchParams.get('aid') || '').trim();
        },
        { timeout: 10000 }
      )
      .toBe('aid-2');
  });

  test('keeps recoverable local assignment state when background finalize loses ownership', async ({
    page,
  }) => {
    const api = createMockAssignmentApi({
      doneErrorsByAssignmentId: {
        'aid-1': 'Assignment is not reserved for this session',
      },
    });

    await page.addInitScript(() => {
      localStorage.setItem('agentName', 'Playwright QA');
      localStorage.setItem('agentEmail', 'playwright@example.com');
      localStorage.setItem('loginMethod', 'username');
      localStorage.setItem('assignmentSessionId', 'pw_session_1');
    });

    await page.route('**/exec**', async (route) => api.routeHandler(route));
    await page.goto('/app.html');

    await expect
      .poll(() => {
        const currentUrl = new URL(page.url());
        return String(currentUrl.searchParams.get('aid') || '').trim();
      })
      .toBe('aid-1');

    await page.fill('#notes', 'Recoverable draft note');
    await page.fill('#internalNotes', 'Recoverable internal note');
    await page.click('#formSubmitBtn');

    await expect.poll(() => api.state.doneCalls, { timeout: 10000 }).toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            try {
              return JSON.parse(localStorage.getItem('qaSubmitOutbox_v1') || '[]').length;
            } catch (_) {
              return -1;
            }
          }),
        { timeout: 10000 }
      )
      .toBe(0);

    expect(api.state.evaluationCalls).toBe(0);

    await expect
      .poll(() =>
        page.evaluate(() => ({
          form: localStorage.getItem('customFormState_assignment_aid-1'),
          notes: localStorage.getItem('internalNotes_assignment_aid-1'),
        }))
      )
      .toEqual({
        form: expect.stringContaining('Recoverable draft note'),
        notes: 'Recoverable internal note',
      });

    await page.goto('/app.html?aid=aid-1&token=token-aid-1&mode=edit');

    await expect(page.locator('#notes')).toHaveValue('Recoverable draft note');
    await expect(page.locator('#internalNotes')).toHaveValue('Recoverable internal note');
  });
});
