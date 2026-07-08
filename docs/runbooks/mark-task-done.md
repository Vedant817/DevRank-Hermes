# Mark a Task Done

Daily plan tasks can be marked complete or skipped from Slack or via the API.

## Via Slack button

When the daily plan is delivered with interactive blocks (`SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` configured), each task has two buttons:

- **Done** — sets status to `completed`
- **Skip** — sets status to `skipped`

When clicked, the message is replaced with a strikethrough line indicating the new status.

Internally the button click hits `POST /api/slack/interactivity`. The request is verified with `SLACK_SIGNING_SECRET` and the payload must include `date` and `taskKey` in the button value (JSON-encoded).

## Via API

```bash
curl -X POST https://your-app.example/api/slack/interactivity \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'payload={"type":"block_actions","actions":[{"action_id":"task_complete","value":"{\"date\":\"2026-07-08\",\"taskKey\":\"dsa:twosum\"}"}],"response_url":"...","user":{"id":"U123"}}'
```

That's equivalent to what Slack sends. For a simpler direct approach, call the database function:

```bash
# Use the CLI to update a task (if exposed)
pnpm devrank log:outcome --help
```

## Database

The underlying query writes to `daily_tasks`:

```
UPDATE daily_tasks SET status = 'completed' WHERE date = :date AND task_key = :taskKey;
```

## Response

- `200 OK` with `{ "task": { "date", "taskKey", "status" } }` on success
- `404` if no task exists for that date/taskKey combination
- `503` if the database update fails

## Notes

- The Slack signature is verified with HMAC-SHA256 and a 5-minute replay window.
- Only `task_complete` and `task_skip` action IDs are accepted.
- The `response_url` is used to update the original Slack message in-place.
- Route-specific token `DEVRANK_SLACK_SEND_TOKEN` can be set to override the shared `DEVRANK_API_TOKEN`.
