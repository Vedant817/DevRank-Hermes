# Slack App Setup

DevRank OS needs a Slack app to deliver interactive daily plans with **Done** and **Skip** buttons.

## 1. Create the app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App**.
2. Choose **From scratch**.
3. Name it `DevRank OS` and select your workspace.
4. Click **Create App**.

## 2. Bot token scopes

Navigate to **OAuth & Permissions** → **Scopes** → **Bot Token Scopes**. Add:

| Scope | Purpose |
|-------|---------|
| `chat:write` | Send daily plan messages |
| `commands` | Register slash commands (optional) |
| `chat:write.public` | Send to channels the bot isn't in (optional) |

## 3. Install the app

1. In **OAuth & Permissions**, click **Install to Workspace**.
2. Authorize the app.
3. Copy the **Bot User OAuth Token** (starts with `xoxb-`).

```text
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
```

## 4. Get the channel ID

1. In Slack, right-click the channel where daily plans should be posted.
2. Select **View channel details**.
3. Scroll to the bottom of the dialog — the **Channel ID** is listed there (starts with `C`).

```text
SLACK_CHANNEL_ID=C1234567890
```

## 5. Signing secret

1. Go to **App Credentials** in your Slack app settings.
2. Copy the **Signing Secret**.

```text
SLACK_SIGNING_SECRET=your-signing-secret
```

This is used by `apps/web/app/api/slack/interactivity/route.ts` to verify that incoming payloads are genuinely from Slack.

## 6. Interactivity URL

1. Go to **Interactivity & Shortcuts**.
2. Toggle **Interactivity** on.
3. Set the **Request URL** to `https://<your-vercel-domain>/api/slack/interactivity`.
4. For local development, use [ngrok](https://ngrok.com) to expose `localhost:3000`.

## 7. Environment summary

```text
# Required for interactive messages (Done/Skip buttons)
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C...
SLACK_SIGNING_SECRET=...

# Required for simple notifications (webhook only)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Both delivery methods are supported. If `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` are set, the interactive block-based message is used. Otherwise it falls back to the webhook.

## 8. Test

```bash
pnpm devrank slack:test
```
