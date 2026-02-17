# Item 5 Runbook: Deploy + Full Staging Validation + Small Pilot

Date baseline: February 17, 2026

## Goal
Deploy the merged backend (`pool-upload.gs`) and validate full session-enforced assignment behavior in staging, then run a small production pilot (2-3 auditors) before full rollout.

## Environment Contract
1. `pool-upload.gs` is the only backend source of truth.
2. `qa-config.js` is the single frontend config source for `GOOGLE_SCRIPT_URL`.
3. Both `app.js` and `login.js` must use the same backend URL via `qa-config.js`.

## Phase 1: Preflight
Quick repo preflight command:

```bash
./scripts/item5-preflight-check.sh
```

1. Backend source check:
   - Confirm only one `doGet`/`doPost` in Apps Script deployment source.
2. Sheets tabs:
   - Ensure `Assignments`, `Pool`, `qa_sessions`, `qa_assignment_history` exist.
   - If missing, `pool-upload.gs` auto-creates with headers.
3. Assignment headers:
   - Confirm assignment columns match `pool-upload.gs` expectations.
4. Pool size:
   - Ensure at least 50 `AVAILABLE` rows in `Pool` for test coverage.
5. Pilot users:
   - Confirm pilot emails are present in `allowed-agents.json` -> `allowedEmails`.

## Phase 2: Staging Backend Deploy
1. Open Apps Script project used by QA site backend.
2. Replace deployed script code with `pool-upload.gs`.
3. Deploy new Web App version and capture URL as `STAGING_SCRIPT_URL`.
4. Smoke checks:
   - `GET ?action=queue` returns error for missing params.
   - `GET ?action=queue&email=<allowed_email>&session_id=<test_id>` returns JSON with:
     - `assignments` array
     - `session` object

## Phase 3: Staging Frontend Wiring
1. Set `qa-config.js`:
   - `GOOGLE_SCRIPT_URL = STAGING_SCRIPT_URL`
2. Deploy staging frontend build.
3. Before each test run:
   - Clear tester local storage (session reset).

## Phase 4: Full Staging Validation Matrix
Mark each as PASS/FAIL with evidence (screenshot or row IDs).

1. Login with allowed email:
   - Queue loads up to 5 assignments.
   - Session state is `ACTIVE`.
2. Submit one evaluation:
   - Current row becomes `DONE`.
   - `submitted_count` increments by 1.
   - Queue refills exactly +1.
3. Skip navigation without submit:
   - Next/Previous works only inside assigned queue.
   - No extra assignment pulled.
4. Submit beyond 20:
   - No lockout/complete state appears.
   - Queue continues to refill +1 after each successful `done`.
5. Explicit logout:
   - `releaseSession` succeeds.
   - Session moves to `COOLDOWN`.
   - Assigned unfinished rows remain reserved.
6. Reconnect/cooldown fallback:
   - Relogin with same email restores the same reserved queue.
7. Reload behavior:
   - Active session resumes without duplicate reservation.
8. Multi-auditor concurrency:
   - Two auditors never receive same active assignment.
9. Username login (no email):
   - Assignment mode blocked with clear message.
10. History/data integrity:
   - `qa_assignment_history` logs assign/done/release events.
   - Legacy evaluation submission still writes to `Data`.

## Phase 5: Production Pilot
1. Deploy same backend version to production Apps Script Web App.
2. Set `qa-config.js` to production Web App URL.
3. Deploy frontend.
4. Run pilot with 2-3 auditors for one real QA shift.
5. Monitor during pilot:
   - `qa_assignment_history`: duplicate assignment signs.
   - `qa_sessions`: stuck `ACTIVE` sessions with stale heartbeat.
   - `Assignments`: invalid status transitions.
6. If clean, promote to full rollout.

## Phase 6: Rollback
Rollback immediately if:
1. Duplicate active assignment ownership appears.
2. Frequent failures in queue reclaim behavior (same-email resume not restoring reserved queue).

Rollback steps:
1. Re-point `qa-config.js` to previous stable backend URL.
2. Redeploy previous Apps Script version.
3. Pause pilot and capture failure evidence from:
   - `qa_assignment_history`
   - `qa_sessions`
   - browser console/network logs

## Acceptance Criteria
1. No duplicate active assignment ownership.
2. Queue policy holds: max 5 active, +1 refill after each successful `done`, with no cap lockout.
3. No inactivity timeout auto-release occurs.
4. Reclaim policy holds: same email reconnect restores reserved queue.
5. Legacy logging/evaluation behavior still works.
