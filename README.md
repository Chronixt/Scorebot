# Factoid Bureau Scorebot

Discord scoring bot for the daily Fact or Fictoid game. EasyPoll creates and runs polls; Scorebot reads completed results, awards points, stores case history, and publishes rankings.

## Requirements

- Node.js and npm
- Cloudflare Workers and D1
- A Discord application installed in the target server
- An EasyPoll API key with `VIEW_GUILD`, `VIEW_POLL`, `LIST_POLL_ANSWERS`, and `LIST_POLL_VOTES`

## Local configuration

Create `.env` for local scripts:

```dotenv
EASYPOLL_API_KEY=
DISCORD_APPLICATION_ID=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
```

Create `.dev.vars` from `.dev.vars.example` when running the Worker locally. Never commit either secrets file.

## Install and verify

```powershell
npm install
npm run typecheck
npm test
npm run db:migrate:local
```

The test suite applies the real migrations to an isolated Miniflare D1 database.

## Cloudflare setup

Create D1 and copy its UUID into `wrangler.jsonc`:

```powershell
npx wrangler login
npx wrangler d1 create factoid-bureau-scorebot --location oc
npm run db:migrate:remote
```

Store production secrets:

```powershell
npx wrangler secret put DISCORD_APPLICATION_ID
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put EASYPOLL_API_KEY
```

Deploy and verify:

```powershell
npm run deploy
Invoke-RestMethod "https://factoid-bureau-scorebot.danevanderbaan.workers.dev/health"
```

Set Discord's Interactions Endpoint URL to:

```text
https://factoid-bureau-scorebot.danevanderbaan.workers.dev/interactions
```

## Discord commands

Register guild-scoped commands using `DISCORD_GUILD_ID` from `.env`:

```powershell
npm run commands:register
```

- `/leaderboard` - all-time ranking
- `/stats [user]` - individual totals and accuracy
- `/case [number]` - stored votes and result for a case
- `/importscore [user] [points]` - administrator-only Cases 1-30 import
- `/correct [case] [answer]` - administrator-only recalculation
- **Score Fact or Fictoid** - administrator-only message context command

To score, close a single-choice EasyPoll, right-click its message, choose **Apps > Score Fact or Fictoid**, and select the correct answer. New cases start at 31. Repeating the action is idempotent.

## Operations

View live structured logs:

```powershell
npx wrangler tail
```

Apply future migrations locally first, then remotely:

```powershell
npm run db:migrate:local
npm test
npm run db:migrate:remote
```

Wrangler captures a D1 backup before applying remote migrations. Scoring and correction writes use D1 batches so partial results roll back.

## Security

- Keep `.env`, `.dev.vars`, Discord bot tokens, and API keys out of source control.
- Rotate a secret immediately if it appears in chat, logs, screenshots, or commits.
- Privileged commands are restricted in Discord and checked again by the Worker.
- The Worker verifies Discord's Ed25519 signature on every interaction.
