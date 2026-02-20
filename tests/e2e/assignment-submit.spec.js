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

    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname.endsWith('/app.html')).toBeTruthy();
    expect(currentUrl.searchParams.has('issue_identification')).toBeFalsy();
    expect(currentUrl.searchParams.has('notes')).toBeFalsy();
  });
});
