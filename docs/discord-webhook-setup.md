# Setting up `DISCORD_PIPELINE_WEBHOOK_URL`

Step-by-step instructions to create the Discord webhook the api-generator-agent uses for live run monitoring. Based on Discord's documented behavior and UI as of May 2026.

> **Critical:** This webhook **must** point to a Discord **forum channel**, not a regular text channel. Forum channels are the only channel type where a webhook can create threads from `thread_name` — and thread-per-run is how the harness keeps each pipeline run isolated. If you point the webhook at a regular text channel, `startThread()` will fail and the integration disables itself for the run.

---

## 1. Prerequisites

You need:

- A Discord server (called a "guild" in the API) where you have one of:
  - The **Manage Server** permission, or
  - The **Manage Channels** + **Manage Webhooks** permissions on the channel you'll use
- The Discord desktop or web client (the mobile app's webhook UI is more limited but works as of May 2026)

If you don't have a server, create one:

1. Click the **+** icon at the bottom of your server list (left rail).
2. Choose **Create My Own** → **For me and my friends**.
3. Give it a name (e.g. `api-generator-agent monitoring`) and click **Create**.

You're now the server owner with all permissions.

---

## 2. Create the forum channel

The harness needs a **forum** channel — not "Text Channel," not "Announcement Channel," not "Voice Channel." Forum channels look like a list of posts (each post is a thread).

1. In the channel list (left of the server window), click the **+** next to a category, **or** right-click any empty area in the channel list and choose **Create Channel**.

2. In the *Create Channel* modal:
   - **Channel Type**: select **Forum** (icon looks like a small list of cards).
     - If you don't see Forum, your server may need Community Server features enabled. Open **Server Settings** → **Enable Community**, follow the prompts, then return to this step. Forum channels are available on all servers as of 2024+, but Community must be enabled to expose them.
   - **Channel Name**: e.g. `pipeline-runs`
   - **Private Channel**: optional. Off = anyone in the server can read. On = only selected roles/members.
3. Click **Create Channel**.

You'll land in the new forum channel. It's empty and shows "Create your first post" — that's expected. The harness will create posts (threads) for you when runs start.

### Optional: tag the channel for tidiness

Forum channels support **tags** that can be applied to posts. The harness doesn't require tags, but you can add some for organization:

1. Right-click the channel → **Edit Channel** → **Tags**.
2. Add tags like `running`, `passed`, `failed`. (The harness won't apply these automatically yet — that's a future feature.)

---

## 3. Create the webhook

1. **Right-click** the forum channel (`pipeline-runs`) and select **Edit Channel**.
2. In the channel settings panel, click **Integrations** in the left sidebar.
3. Under **Webhooks**, click **Create Webhook**.
4. Discord creates a default webhook named `Captain Hook` (or similar). Click on it to expand its settings.
5. Configure:
   - **Name**: `api-generator-agent` (or whatever you want — this is what shows as the message author in the channel)
   - **Avatar**: optional. Click the avatar circle and upload a project logo.
   - **Channel**: confirm it's set to your forum channel. (Should already be — you created the webhook from inside it.)
6. Click **Copy Webhook URL** at the bottom of the webhook settings.

The URL looks like:

```
https://discord.com/api/webhooks/<numeric-id>/<token>
```

Both the numeric ID and the token are required — copy the whole thing.

7. Click **Save Changes** at the bottom of the modal.

> **Treat the webhook URL as a secret.** Anyone with this URL can post messages to your channel as your webhook. Don't commit it to git, don't paste it in chat, don't put it in screenshots.

---

## 4. Add the URL to `.env`

Open `.env` at the repo root (create it from `.env.example` if it doesn't exist):

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
DISCORD_ENABLED=true
DISCORD_TRANSPORT=webhook
DISCORD_PIPELINE_WEBHOOK_URL=https://discord.com/api/webhooks/1234567890123456789/abcDEFghi...
```

Save the file. `.env` is gitignored, so the URL stays local.

---

## 5. Verify the webhook works

Before running the pipeline, confirm Discord accepts the URL with a one-line test from your terminal:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"content":"Webhook test from api-generator-agent"}' \
  "$DISCORD_PIPELINE_WEBHOOK_URL"
```

On Windows PowerShell:

```powershell
curl.exe -X POST -H "Content-Type: application/json" `
  -d '{\"content\":\"Webhook test from api-generator-agent\"}' `
  $env:DISCORD_PIPELINE_WEBHOOK_URL
```

A successful response is HTTP 204 No Content (no body) and a new post appears in your forum channel titled "Webhook test from api-generator-agent". You can delete that test post afterward.

If you get a 4xx response:

| Code | Meaning | Fix |
|---|---|---|
| 401 Unauthorized | Wrong token in the URL | Re-copy the URL from Discord |
| 404 Not Found | Webhook deleted, channel deleted, or token typo | Re-create the webhook |
| 400 Bad Request | Channel is not a forum channel | Re-do step 2 with **Forum** as the channel type |

---

## 6. Run the pipeline

Now any run will create a forum post (thread) per run with one live-edited card per task:

```bash
bun run src/index.mts <your-prd>
```

You should see in the logs:

```
[discord] thread created for run <runId>: <threadId>
```

Open Discord — there should be a new post titled `run-<short-id>` with cards posting and updating as tasks progress.

---

## 7. (Optional) Set up the alert and QA-tools webhooks

The same procedure applies to the other two webhook URLs:

| Env var | Where it points | Purpose |
|---|---|---|
| `DISCORD_PIPELINE_WEBHOOK_URL` | A forum channel | Per-run threads with live task cards |
| `DISCORD_ALERT_WEBHOOK_URL` | Any channel (text or forum) | Hard-failure pings with `@mention` |
| `DISCORD_QA_TOOLS_WEBHOOK_URL` | A forum channel | Reserved for the future agentic QA-tools loop |

For `DISCORD_ALERT_WEBHOOK_URL` you may want a **separate channel** named something like `#api-generator-alerts` so hard failures don't get lost in the run-thread scrollback.

`DISCORD_ALERT_MENTION` controls who gets pinged on hard failures:

| Value | Effect |
|---|---|
| `@here` | Pings online members in the alert channel |
| `<@123456789012345678>` | Pings a specific user (use the numeric user ID — right-click user → **Copy User ID** with Developer Mode on) |
| `<@&123456789012345678>` | Pings a role (right-click role → **Copy Role ID**) |
| (empty) | Posts the alert without pinging |

Enable Developer Mode in Discord under **User Settings** → **Advanced** → **Developer Mode** if you need to copy IDs.

---

## 8. Permissions troubleshooting

If `Create Webhook` is greyed out:

- The channel-level **Manage Webhooks** permission is missing for your role. Server admin can grant it via **Server Settings** → **Roles** → \[your role\] → **Permissions** → enable **Manage Webhooks**.
- For private channels, you also need **View Channel** for that channel.

If the Forum channel type doesn't appear when creating a channel:

- Open **Server Settings** → **Overview** and confirm Community is enabled. If not, click **Enable Community** at the bottom and walk through the wizard. Community sets a couple of defaults (rules channel, updates channel) — you can dismiss any you don't want.

---

## 9. Rotating or revoking a webhook

If the URL leaks:

1. Open **Edit Channel** → **Integrations** → **Webhooks**.
2. Click the webhook → either **Delete Webhook** (revoke entirely) or click the URL field and **Reset Token** (issues a new token, old one stops working immediately).
3. Update `.env` with the new URL.

The harness handles webhook failures gracefully — if Discord starts returning 401 mid-run because the webhook was rotated, the channel marks itself unhealthy and the pipeline continues without Discord output. You'll just see warnings in the run log.
