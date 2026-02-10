# Cloudflare Worker for Templates Upload

This worker exposes:
- `GET /templates` -> returns `templates.json`
- `POST /templates` -> merges by `TEMPLATE_ID` and writes `templates.json`

## Required Secrets (Cloudflare)
- `GH_TOKEN`: GitHub token with `repo` scope

## Required Vars
- `GH_OWNER`: repo owner/org
- `GH_REPO`: repo name
- `GH_BRANCH`: branch name (default `main`)
- `GH_TEMPLATES_PATH`: path to `templates.json` (default `templates.json`)
- `GH_SCENARIOS_PATH`: path to uploaded scenarios file (default `scenarios.json`)

## Local dev (optional)
```bash
cd cloudflare-worker
wrangler dev
```

## Deploy
```bash
cd cloudflare-worker
wrangler deploy
```
