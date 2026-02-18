const { test, expect } = require('@playwright/test');

const SNAPSHOT_ID = 'snap-test-1';
const SNAPSHOT_TOKEN = 'snap-token-1';

test.describe('Snapshot view', () => {
  test('renders templates and browsing history from snapshot payload', async ({ page }) => {
    await page.route('**/exec**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const action = String(url.searchParams.get('action') || '');

      if (action !== 'getSnapshot') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ok' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          snapshot: {
            snapshot_id: SNAPSHOT_ID,
            created_at: '2026-02-18T00:00:00.000Z',
            expires_at: '2026-02-20T00:00:00.000Z',
            payload: {
              assignment_id: '',
              send_id: '019bebf7-17aa-48de-f000-0000f506a3fe',
              internal_note: 'Snapshot note',
              scenario: {
                id: '019bebf7-17aa-48de-f000-0000f506a3fe',
                companyName: 'Julie Vos',
                companyWebsite: 'https://julievos.com',
                customerPhone: '(555) 111-2222',
                conversation: [
                  { role: 'customer', content: 'Need sizing help please.' },
                  { role: 'agent', content: 'Absolutely, I can help with that.' },
                ],
                notes: {
                  website: ['Sizing chart available'],
                },
                rightPanel: {
                  source: { label: 'Website', value: 'julievos.com', date: 'Today' },
                  browsing_history: [
                    {
                      item: 'Savoy Hoop Earrings',
                      link: 'https://julievos.com/products/savoy-hoop',
                      timeAgo: '2m ago',
                    },
                  ],
                },
              },
              templates: [
                {
                  name: 'Welcome Template',
                  shortcut: '/welcome',
                  content: 'Thanks for contacting us. Happy to help.',
                  companyName: 'Julie Vos',
                },
              ],
            },
          },
        }),
      });
    });

    await page.goto(`/app.html?snap=${SNAPSHOT_ID}&st=${SNAPSHOT_TOKEN}`);

    await expect(page.locator('#companyNameLink')).toHaveText(/Julie Vos/i);
    await expect(page.locator('#browsingHistory')).toContainText('Savoy Hoop Earrings');
    await expect(page.locator('#templateItems')).toContainText('Welcome Template');
    await expect(page.locator('#internalNotes')).toHaveValue('Snapshot note');
  });
});
