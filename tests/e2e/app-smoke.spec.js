const { test, expect } = require('@playwright/test');

test.describe('QA System smoke checks', () => {
  test('loads app shell and key controls', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('agentName', 'Playwright QA');
      localStorage.setItem('agentEmail', 'playwright@example.com');
      localStorage.setItem('loginMethod', 'username');
      localStorage.setItem('assignmentSessionId', `pw_${Date.now()}`);
    });

    await page.goto('/app.html');

    await expect(page.locator('#customForm')).toBeVisible();
    await expect(page.locator('.search-templates input')).toBeVisible();
    await expect(page.locator('#nextConversationBtn')).toBeVisible();
    await expect(page.locator('#previousConversationBtn')).toBeVisible();
    await expect(page.locator('#snapshotShareBtn')).toBeVisible();
  });
});
