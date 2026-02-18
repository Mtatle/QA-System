# Local Validation Setup

## Install

```bash
cd QA-System
npm install
npm run test:e2e:install
```

## Run checks

```bash
npm run check
```

Includes:

- JS syntax checks
- ESLint
- runtime data integrity checks (`data/scenarios` + `data/templates`)
- Prettier checks (tooling/test files)

## Run browser tests

```bash
npm run test:e2e
```

Useful targeted suites:

```bash
npm run test:e2e:assignment
npm run test:e2e:snapshot
```

## Notes

- Browser tests require Linux Playwright runtime libraries on this machine.
- If Playwright reports missing shared libs, run: `npx playwright install-deps chromium`.
- Assignment/snapshot e2e tests use mocked backend routes, so they stay stable even if Google Apps Script is slow.
