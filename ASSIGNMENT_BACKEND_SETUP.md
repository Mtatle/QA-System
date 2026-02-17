# Assignment Session Backend Setup

The assignment/session logic is now merged into `pool-upload.gs`.

## What it adds
1. Queue refill to keep up to 5 active assignments.
2. +1 refill after each successful `done`.
3. No per-session cap; refill continues indefinitely while session is active.
4. `releaseSession` starts cooldown hold (no immediate release).
5. No inactivity timeout auto-release.
6. Session + assignment history tabs (`qa_sessions`, `qa_assignment_history`).
7. Existing upload/pool endpoints remain in the same script (`addToPool`, uploaded scenarios/templates handlers).

## Deploy (Apps Script)
1. Open your Apps Script project.
2. Replace your deployed backend code with `pool-upload.gs`.
3. Deploy a new web app version.

Do not deploy `google-assignment-session-backend.gs` alongside it, since duplicate `doGet`/`doPost` handlers will conflict.

## Frontend URL Config
Use `qa-config.js` as the single source for the backend URL:

`GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/<deployment-id>/exec'`

Both `app.js` and `login.js` read from this same value.

For Item 5 rollout steps and validation matrix, use:

`ITEM5_DEPLOY_STAGING_PILOT_RUNBOOK.md`

## Required Sheets
1. `Assignments`
2. `Pool`
3. `qa_sessions`
4. `qa_assignment_history`

The script auto-creates these tabs and headers if missing.

## Assignment Columns Used
`send_id, assignee_email, status, assignment_id, created_at, updated_at, done_at, editor_token, viewer_token, form_state_json, internal_note, assigned_session_id, assigned_at`

Active assignment statuses are `ASSIGNED` and `IN_PROGRESS`; completed is `DONE`.
