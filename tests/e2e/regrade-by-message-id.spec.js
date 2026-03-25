const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { createMockAssignmentApi } = require('./helpers/mock-assignment-api');

function loadRuntimeSendIds(fallback = []) {
  try {
    const indexPath = path.resolve(__dirname, '../../data/scenarios/index.json');
    const indexPayload = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const fromById = indexPayload && indexPayload.byId ? Object.keys(indexPayload.byId) : [];
    const ids = fromById.map((value) => String(value || '').trim()).filter(Boolean);
    if (ids.length) return ids;
  } catch (_) {
    // Ignore index read issues and use fallback ids instead.
  }
  return Array.isArray(fallback)
    ? fallback.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
}

const fallbackSendIds = [
  '019bebf7-17aa-48de-f000-0000f506a3fe',
  '019bd3ae-2a24-478d-f000-0000efb67321',
  '019bdd15-7512-4e9e-f000-0000d6364a39',
  '019bd742-baf8-425f-f000-00003e7e7b41',
];

function buildSendIdSet() {
  const runtimeSendIds = loadRuntimeSendIds(fallbackSendIds);
  const ids = runtimeSendIds.slice(0, 4);
  while (ids.length < 4 && fallbackSendIds[ids.length]) {
    ids.push(fallbackSendIds[ids.length]);
  }
  return ids;
}

async function seedEmailLogin(page, email = 'playwright@example.com') {
  await page.addInitScript(
    ({ emailValue }) => {
      localStorage.setItem('agentName', 'Playwright QA');
      localStorage.setItem('agentEmail', emailValue);
      localStorage.setItem('loginMethod', 'google');
      localStorage.setItem('assignmentSessionId', 'pw_session_1');
    },
    { emailValue: email }
  );
}

test.describe('Regrade by message ID', () => {
  test('regrade control stays hidden for username login', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('agentName', 'Username QA');
      localStorage.setItem('loginMethod', 'username');
      localStorage.removeItem('agentEmail');
      localStorage.removeItem('assignmentSessionId');
    });

    await page.goto('/app.html');

    await expect
      .poll(() => page.locator('#regradeToggleBtn').evaluate((element) => element.hidden))
      .toBe(true);
    await expect
      .poll(() => page.locator('#regradeBanner').evaluate((element) => element.hidden))
      .toBe(true);
  });

  test('reopens a completed audit, removes the prior data row, and allows resubmission', async ({
    page,
  }) => {
    const sendIds = buildSendIdSet();
    const restoredFormState = {
      'issue_identification::necessary_reply': false,
      'proper_resolution::partial_reply': false,
      zero_tolerance: 'opt_out',
      notes: 'Restored note from the original audit',
    };
    const api = createMockAssignmentApi({
      selectedSendIds: sendIds.slice(0, 3),
      completedAssignments: [
        {
          assignment_id: 'aid-done-1',
          send_id: sendIds[3],
          assignee_email: 'playwright@example.com',
          form_state_json: JSON.stringify(restoredFormState),
          internal_note: 'Restored internal note',
        },
      ],
      initialDataRows: [
        {
          assignmentId: 'aid-done-1',
          messageId: sendIds[3],
          notes: 'Old data row',
        },
      ],
    });

    await seedEmailLogin(page);
    await page.route('**/exec**', async (route) => api.routeHandler(route));
    await page.goto('/app.html');

    await expect
      .poll(() => {
        const currentUrl = new URL(page.url());
        return String(currentUrl.searchParams.get('aid') || '').trim();
      })
      .toBe('aid-1');
    await expect(page.locator('#regradeToggleBtn')).toBeVisible();

    await page.click('#regradeToggleBtn');
    await expect(page.locator('#regradeBanner')).toBeVisible();
    await page.fill('#regradeMessageId', sendIds[3]);

    const confirmPromise = page.waitForEvent('dialog').then((dialog) => dialog.accept());
    await page.click('#regradeSubmitBtn');
    await confirmPromise;

    await expect.poll(() => api.state.regradeCalls, { timeout: 10000 }).toBe(1);
    await expect.poll(() => api.getDataRows().length, { timeout: 10000 }).toBe(0);
    await expect
      .poll(() => {
        const currentUrl = new URL(page.url());
        return String(currentUrl.searchParams.get('aid') || '').trim();
      })
      .toBe('aid-done-1');

    await expect(page.locator('#notes')).toHaveValue('Restored note from the original audit');
    await expect(page.locator('#internalNotes')).toHaveValue('Restored internal note');
    await expect(
      page.locator('input[name="issue_identification"][value="necessary_reply"]')
    ).not.toBeChecked();
    await expect(
      page.locator('input[name="proper_resolution"][value="partial_reply"]')
    ).not.toBeChecked();
    await expect(page.locator('#zeroTolerance')).toHaveValue('opt_out');

    await page.click('#formSubmitBtn');

    await expect.poll(() => api.state.doneCalls, { timeout: 10000 }).toBeGreaterThan(0);
    await expect.poll(() => api.state.evaluationCalls, { timeout: 10000 }).toBeGreaterThan(0);
    await expect
      .poll(() => api.getDataRows().filter((row) => row.messageId === sendIds[3]).length, {
        timeout: 10000,
      })
      .toBe(1);
    await expect
      .poll(() => {
        const assignment = api.getAssignment('aid-done-1');
        return assignment ? String(assignment.status || '') : '';
      })
      .toBe('DONE');
  });

  test('rejects regrade attempts for missing IDs and other auditors', async ({ page }) => {
    const sendIds = buildSendIdSet();
    const api = createMockAssignmentApi({
      selectedSendIds: sendIds.slice(0, 3),
      completedAssignments: [
        {
          assignment_id: 'aid-done-other',
          send_id: sendIds[3],
          assignee_email: 'other.auditor@example.com',
          form_state_json: JSON.stringify({ notes: 'Hidden from current auditor' }),
          internal_note: 'Other auditor note',
        },
      ],
    });

    await seedEmailLogin(page);
    await page.route('**/exec**', async (route) => api.routeHandler(route));
    await page.goto('/app.html');

    await expect(page.locator('#regradeToggleBtn')).toBeVisible();
    await page.click('#regradeToggleBtn');

    await page.fill('#regradeMessageId', sendIds[3]);
    let confirmPromise = page.waitForEvent('dialog').then((dialog) => dialog.accept());
    await page.click('#regradeSubmitBtn');
    await confirmPromise;

    await expect(page.locator('#regradeStatus')).toContainText('different auditor');
    await expect
      .poll(() => {
        const currentUrl = new URL(page.url());
        return String(currentUrl.searchParams.get('aid') || '').trim();
      })
      .toBe('aid-1');

    await page.fill('#regradeMessageId', 'missing-send-id');
    confirmPromise = page.waitForEvent('dialog').then((dialog) => dialog.accept());
    await page.click('#regradeSubmitBtn');
    await confirmPromise;

    await expect(page.locator('#regradeStatus')).toContainText('No completed audit found');
  });
});
