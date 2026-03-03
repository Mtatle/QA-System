# QA System

A browser-based audit portal and local validation tooling for quality-assurance reviews of customer-service conversations.

Auditors log in, are assigned conversation scenarios, fill in a structured QA form, and submit results back to a Google Apps Script backend. A companion Snowflake pipeline exports audit data and resets the assignment pool automatically.

---

## Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the App](#running-the-app)
- [NPM Scripts](#npm-scripts)
- [End-to-End Tests](#end-to-end-tests)
- [Audit Query Pipeline](#audit-query-pipeline)
- [Content Manager (Uploader)](#content-manager-uploader)
- [Data Files](#data-files)
- [Access Control](#access-control)
- [CI](#ci)

---

## Features

- **Login** — Google Sign-In (OAuth) with a username fallback; session persists for 24 hours.
- **Assignment queue** — Auditors navigate through assigned conversation scenarios using previous / next controls.
- **QA submission form** — Structured checklist covering:
  - Issue Identification
  - Proper Resolution
  - Product Sales
  - Accuracy (links, promos, credible sources)
  - Workflow
  - Clarity
  - Tone
  - Zero Tolerance (inappropriate language, opt-out, personal information)
- **Chat panel** — Displays the full customer / agent conversation with an internal-notes textarea.
- **Company context panel** — Shows company name, Shopify badge, agent profile, blocklisted words, escalation preferences, promotions, and dynamic guidelines.
- **Templates panel** — Searchable response-template library (keyboard shortcut `Ctrl + /`).
- **Snapshot sharing** — Creates a shareable link to the current conversation view.
- **Session timer** — Visible countdown / elapsed-time display in the top bar.
- **Audit pipeline** — Node.js script that runs Snowflake SQL, exports two CSVs, and resets the Google Sheets assignment pool.

---

## Project Structure

```
QA-System/
├── index.html              # Login page
├── app.html                # Main auditor portal
├── login.js                # Login page logic (Google + username auth)
├── app.js                  # Main application logic
├── style.css               # Shared stylesheet
├── qa-config.js            # Runtime configuration (backend URL, debug flag)
├── allowed-agents.json     # Access-control lists (usernames & emails)
├── scenarios.json          # Legacy scenarios root (superseded by data/scenarios/)
├── templates.json          # Legacy templates root (superseded by data/templates/)
├── assets/
│   └── images/             # Site icon, Shopify logo
├── data/
│   ├── scenarios/
│   │   └── index.json      # Scenario index (order, byKey, byId)
│   └── templates/
│       ├── index.json      # Template index (globalFile, companies map)
│       └── global.json     # Global templates available to all companies
├── queries/
│   ├── audits.sql          # Snowflake SQL for the audit pipeline
│   ├── README.md           # Audit pipeline documentation
│   └── out/                # Generated CSV output (git-ignored)
├── scripts/
│   ├── run-audits-pipeline.js      # Snowflake → CSV → Apps Script pipeline
│   ├── validate-runtime-data.js    # CI data-integrity checker
│   └── item5-preflight-check.sh   # Shell preflight helper
├── tests/
│   └── e2e/                # Playwright end-to-end test specs
├── tools/
│   └── uploader/           # Content Manager desktop tool (Mac & Windows)
├── playwright.config.js
├── eslint.config.js
├── .prettierrc.json
└── package.json
```

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18 LTS (24 recommended) |
| npm | 9+ |
| Python 3 | 3.8+ (local dev server) |
| Chromium | installed via Playwright |

---

## Installation

```bash
# Install Node dependencies
npm ci

# Install the Playwright browser (Chromium)
npm run test:e2e:install
```

---

## Configuration

Edit **`qa-config.js`** to point at your Google Apps Script web-app:

```js
window.QA_CONFIG = Object.assign({}, window.QA_CONFIG || {}, {
    // Replace with your deployed Apps Script URL
    GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/<YOUR_DEPLOYMENT_ID>/exec',
    DEBUG: false,   // set true to enable verbose console logging
});
```

The Google Apps Script URL is also read by the audit pipeline (`scripts/run-audits-pipeline.js`). You can override it with the `GOOGLE_SCRIPT_URL` environment variable at runtime.

---

## Running the App

The app is a static site — serve it with any HTTP server on `localhost`:

```bash
# Python built-in server (same command used by Playwright)
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173` in your browser.

---

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run check` | Runs all static checks (syntax, lint, data validation, format) |
| `npm run check:syntax` | Node syntax check on `app.js`, `login.js`, `qa-config.js` |
| `npm run lint` | ESLint |
| `npm run check:data` | Validates `data/` JSON integrity (`scripts/validate-runtime-data.js`) |
| `npm run format:check` | Prettier format check |
| `npm run format` | Prettier auto-format |
| `npm run test:e2e` | Run all Playwright e2e tests (headless) |
| `npm run test:e2e:assignment` | Run assignment-submit spec only |
| `npm run test:e2e:snapshot` | Run snapshot-view spec only |
| `npm run test:e2e:ui` | Open Playwright UI mode |
| `npm run test:e2e:install` | Install Playwright Chromium browser |
| `npm run audits:run` | Run the full Snowflake audit pipeline |

---

## End-to-End Tests

Tests live in `tests/e2e/` and run against a local Python HTTP server (port `4173`). Playwright starts the server automatically.

```bash
npm run test:e2e
```

Specs:

| File | What it covers |
|------|---------------|
| `app-smoke.spec.js` | Key UI controls are visible after login |
| `assignment-submit.spec.js` | Full assignment fetch → form fill → submit flow |
| `multi-auditor-login.spec.js` | Multiple concurrent auditor sessions |
| `snapshot-view.spec.js` | Snapshot link generation and loading |

CI uploads Playwright HTML reports and trace files as artifacts on every run.

---

## Audit Query Pipeline

Runs `queries/audits.sql` against Snowflake, exports two CSVs, and resets the Google Sheets assignment pool.

```bash
npm run audits:run
```

### Required environment variables

| Variable | Description |
|----------|-------------|
| `SNOWFLAKE_ACCOUNT` | Snowflake account identifier |
| `SNOWFLAKE_USER` | Snowflake username |
| `SNOWFLAKE_WAREHOUSE` | Warehouse name |
| `SNOWFLAKE_DATABASE` | Database name |
| `SNOWFLAKE_SCHEMA` | Schema name |
| `SNOWFLAKE_PASSWORD` | Password (not required when using `externalbrowser`) |

### Optional environment variables

| Variable | Description |
|----------|-------------|
| `SNOWFLAKE_ROLE` | Snowflake role |
| `SNOWFLAKE_AUTHENTICATOR` | `externalbrowser` for SSO / browser auth |
| `GOOGLE_SCRIPT_URL` | Overrides the URL from `qa-config.js` |

### CLI flags

```bash
# Skip resetting the Google Sheets assignments pool
node scripts/run-audits-pipeline.js --skip-sheet-update

# Custom SQL file and output directory
node scripts/run-audits-pipeline.js --sql queries/audits.sql --out-dir queries/out
```

### Output files

| File | Description |
|------|-------------|
| `queries/out/audits-uploader.csv` | Uploader-ready CSV (`SEND_ID`, `COMPANY_NAME`, `CONVERSATION_JSON`, …) |
| `queries/out/cqa-target-sends.csv` | Distinct `send_id` list from `cqa_target_sends` |

See [`queries/README.md`](queries/README.md) for full pipeline documentation.

---

## Content Manager (Uploader)

Desktop tools for uploading scenario and template content to the Google Apps Script backend.

| File | Platform |
|------|----------|
| `tools/uploader/content-manager.ps1` | Windows (PowerShell GUI) |
| `tools/uploader/launch-content-manager.bat` | Windows launcher |
| `tools/uploader/content-manager-mac.mjs` | macOS (Node.js) |
| `tools/uploader/launch-content-manager-mac.sh` | macOS launcher |
| `tools/uploader/launch-content-manager-mac.command` | macOS double-click launcher |
| `tools/uploader/pool-upload.gs` | Google Apps Script (server-side) |

---

## Data Files

### Scenarios (`data/scenarios/`)

- **`index.json`** — Master index with three keys:
  - `order` — Ordered array of scenario keys.
  - `byKey` — Maps each key → `{ id, chunkFile }`.
  - `byId` — Maps each `send_id` → scenario key.
- **Chunk files** — JSON files referenced by `chunkFile` in the index; each contains a `scenarios` object keyed by scenario key.

Run `npm run check:data` to validate referential integrity across all index and chunk files.

### Templates (`data/templates/`)

- **`index.json`** — Contains `globalFile` (path to global templates) and a `companies` map of company key → template file path.
- **`global.json`** — Global template array available in all company contexts.
- **Company files** — Per-company template arrays (`{ templates: [{ name, content }] }`).

---

## Access Control

**`allowed-agents.json`** controls who can log in:

```jsonc
{
  "allowedAgents": ["admin", "petra"],       // username login whitelist
  "allowedEmails": ["user@example.com"],     // Google Sign-In email whitelist
  "csvUploadAllowedAgents": ["admin"],       // can upload scenario CSV
  "csvUploadAllowedEmails": ["user@example.com"],
  "templateUploadAllowedAgents": ["admin"],  // can upload templates
  "templateUploadAllowedEmails": ["user@example.com"]
}
```

Add usernames (lowercase) or Google email addresses to grant access.

---

## CI

GitHub Actions runs on every push and pull request (`.github/workflows/ci.yml`):

1. **Install dependencies** — `npm ci`
2. **Install Playwright browser** — `npx playwright install --with-deps chromium`
3. **Static checks** — `npm run check` (syntax + lint + data validation + format)
4. **End-to-end tests** — `npm run test:e2e`
5. **Upload artifacts** — Playwright HTML report and trace files
