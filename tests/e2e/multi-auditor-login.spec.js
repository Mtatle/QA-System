const { test, expect } = require('@playwright/test');
const { createMockMultiAuditorApi } = require('./helpers/mock-multi-auditor-api');

async function primeAuditorSession(page, options) {
  const agentName = String(options.agentName || '');
  const agentEmail = String(options.agentEmail || '');
  const sessionId = String(options.sessionId || '');
  await page.addInitScript(
    ({ name, email, sid }) => {
      localStorage.setItem('agentName', name);
      localStorage.setItem('agentEmail', email);
      localStorage.setItem('loginMethod', 'username');
      localStorage.setItem('assignmentSessionId', sid);
    },
    { name: agentName, email: agentEmail, sid: sessionId }
  );
}

async function runConcurrentAuditFlow(browser, api, auditors) {
  const contexts = await Promise.all(
    auditors.map(() => browser.newContext({ baseURL: 'http://127.0.0.1:4173' }))
  );
  const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

  await Promise.all(
    contexts.map((ctx) => ctx.route('**/exec**', async (route) => api.routeHandler(route)))
  );
  await Promise.all(
    pages.map((page, index) =>
      primeAuditorSession(page, {
        agentName: String(auditors[index].agentName || ''),
        agentEmail: String(auditors[index].agentEmail || ''),
        sessionId: String(auditors[index].sessionId || ''),
      })
    )
  );
  await Promise.all(pages.map((page) => page.goto('/app.html')));
  await Promise.all(pages.map((page) => expect(page.locator('#companyNameLink')).toBeVisible()));

  const firstAssignmentIds = await Promise.all(
    pages.map(async (page) => {
      await expect
        .poll(
          () => {
            const url = new URL(page.url());
            return String(url.searchParams.get('aid') || '').trim();
          },
          { timeout: 12000 }
        )
        .not.toBe('');
      const currentUrl = new URL(page.url());
      return String(currentUrl.searchParams.get('aid') || '').trim();
    })
  );
  expect(new Set(firstAssignmentIds).size).toBe(auditors.length);

  await Promise.all(
    pages.map((page, index) => page.fill('#notes', `auditor ${index + 1} concurrent submit`))
  );
  await Promise.all(pages.map((page) => page.click('#formSubmitBtn')));

  await Promise.all(
    pages.map((page, index) =>
      expect
        .poll(
          () => {
            const url = new URL(page.url());
            return String(url.searchParams.get('aid') || '').trim();
          },
          {
            timeout: 12000,
          }
        )
        .not.toBe(firstAssignmentIds[index])
    )
  );

  const secondAssignmentIds = await Promise.all(
    pages.map(async (page) => {
      const url = new URL(page.url());
      return String(url.searchParams.get('aid') || '').trim();
    })
  );
  expect(new Set(secondAssignmentIds).size).toBe(auditors.length);

  await Promise.all(
    pages.map(async (page) => {
      const url = new URL(page.url());
      expect(url.pathname.endsWith('/app.html')).toBeTruthy();
      expect(url.searchParams.has('notes')).toBeFalsy();
    })
  );

  await Promise.all(contexts.map((ctx) => ctx.close()));
}

test.describe('Multi-auditor concurrency', () => {
  test('two auditors can work concurrently without assignment collisions', async ({ browser }) => {
    const api = createMockMultiAuditorApi();
    await runConcurrentAuditFlow(browser, api, [
      {
        agentName: 'Auditor A',
        agentEmail: 'auditor.a@example.com',
        sessionId: 'pw_session_a',
      },
      {
        agentName: 'Auditor B',
        agentEmail: 'auditor.b@example.com',
        sessionId: 'pw_session_b',
      },
    ]);
    await expect.poll(() => api.state.doneCalls, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => api.state.evaluationCalls, { timeout: 10000 })
      .toBeGreaterThanOrEqual(2);
  });

  test('three auditors can work concurrently without assignment collisions', async ({
    browser,
  }) => {
    const api = createMockMultiAuditorApi({ targetQueueSize: 2 });
    await runConcurrentAuditFlow(browser, api, [
      {
        agentName: 'Auditor A',
        agentEmail: 'auditor.a@example.com',
        sessionId: 'pw_session_a',
      },
      {
        agentName: 'Auditor B',
        agentEmail: 'auditor.b@example.com',
        sessionId: 'pw_session_b',
      },
      {
        agentName: 'Auditor C',
        agentEmail: 'auditor.c@example.com',
        sessionId: 'pw_session_c',
      },
    ]);
    await expect.poll(() => api.state.doneCalls, { timeout: 10000 }).toBeGreaterThanOrEqual(3);
    await expect
      .poll(() => api.state.evaluationCalls, { timeout: 10000 })
      .toBeGreaterThanOrEqual(3);
  });
});
