# GitHub App Setup

Use a GitHub App for production webhooks and a personal access token only for
local backfill during development.

## Webhook

- URL: `/api/github/webhook`
- Secret env var: `GITHUB_WEBHOOK_SECRET`
- Events: repository, push, pull request, pull request review, review comment,
  issues, release, and workflow run.

## Minimal Permissions

- Repository metadata: read
- Contents: read
- Pull requests: read
- Issues: read
- Checks/actions: read

## Backfill

For local REST backfill:

```text
GITHUB_PERSONAL_ACCESS_TOKEN=...
```

Then run:

```bash
pnpm devrank github:backfill --user vedantmahajan271
```
