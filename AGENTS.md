## Project Overview

Spectro is a Discord bot for anonymous confessions with moderation logging. Built with SvelteKit + PostgreSQL + Inngest for background jobs.

## Commands

```bash
# Development
pnpm install              # Install dependencies
pnpm dev                  # Start dev server (port 5173)
pnpm build                # Production build
pnpm preview              # Preview production build

# Database (Drizzle ORM)
pnpm db:generate          # Generate migration SQL from schema
pnpm db:migrate           # Run pending migrations
pnpm db:push              # Push schema directly (no SQL)
pnpm db:studio            # Open Drizzle Studio UI

# Environment-scoped commands
pnpm env:dev pnpm db:migrate     # Run with .env.development
pnpm env:prod pnpm db:migrate    # Run with .env.production

# Linting
pnpm fmt                  # Check formatting (Prettier)
pnpm fmt:fix              # Fix formatting
pnpm lint                 # Run all lints in parallel
pnpm lint:eslint          # ESLint only
pnpm lint:svelte          # Svelte type check only

# Local services (Docker Compose)
docker compose up --detach   # Start db, inngest, o2 (OpenObserve)
docker compose down          # Stop all services
```

> [!IMPORTANT]
> After building features, you MUST run `pnpm lint` followed by `pnpm fmt:fix` to uphold codebase conventions.

## Architecture

### Stack

- **Frontend**: Svelte 5 + SvelteKit + Tailwind CSS + DaisyUI
- **Backend**: SvelteKit server routes + Vercel adapter (Node.js 24.x)
- **Database**: PostgreSQL 18 via Drizzle ORM (`src/lib/server/database/`)
- **Background Jobs**: Inngest (`src/lib/server/inngest/`)
- **Observability**: OpenTelemetry (`src/lib/server/telemetry/`)
- **Validation**: Valibot for schema parsing

### Key Directories

```
src/lib/server/
├── api/discord.ts           # Discord API client (DiscordClient.ENV singleton)
├── confession/              # Confession formatting & embed logic
├── database/
│   ├── index.ts             # Main DB operations
│   └── models/index.ts      # Drizzle schema (guild, channel, confession, attachment)
├── env/                     # Environment variable loaders for app-specific runtime config
├── inngest/
│   ├── functions/           # Background jobs (post-confession, log-confession, dispatch-approval)
│   └── schema.ts            # Event schemas (Valibot)
├── models/discord/          # Discord API type definitions (~72 files)
└── telemetry/               # Logger and Tracer classes

src/routes/webhook/
├── discord/interaction/     # Discord command & modal handlers
│   ├── +server.ts           # Main router with Ed25519 verification
│   ├── confess-modal.ts     # /confess command → modal
│   ├── modal-submit.ts      # Process confession submissions
│   ├── setup.ts             # /setup command
│   ├── lockdown.ts          # /lockdown command
│   ├── approval.ts          # Approval button handler
│   └── ...
├── discord/event/           # OAuth2 authorization events
└── inngest/                 # Inngest webhook endpoint
```

### Data Flow

1. User triggers `/confess` or "Reply Anonymously" → Discord sends interaction webhook
2. `+server.ts` verifies Ed25519 signature, parses interaction, routes to handler
3. Handler opens modal → user submits → `modal-submit.ts` processes
4. Database transaction inserts confession
5. Inngest events trigger parallel background jobs (post to channel, log for mods)

### Discord Commands (see `discord.json`)

| Command             | Permission      | Description                        |
| ------------------- | --------------- | ---------------------------------- |
| `/confess`          | SEND_MESSAGES   | Submit anonymous confession        |
| `/setup`            | MANAGE_CHANNELS | Configure confession channel       |
| `/lockdown`         | MANAGE_CHANNELS | Temporarily disable confessions    |
| `/resend`           | MANAGE_MESSAGES | Resend confession by ID            |
| `/info`             | Public          | Bot information                    |
| `/help`             | Public          | Help page                          |
| `Reply Anonymously` | SEND_MESSAGES   | Context menu for anonymous replies |

### Database Schema (`app` schema)

- **guild**: Discord servers, tracks `lastConfessionId` (auto-increment per server)
- **channel**: Confession channels with custom label/color, approval toggle, log channel
- **confession**: Content, author, timestamps, optional parent message (replies), attachment ref
- **attachment_data**: Discord file metadata (id, filename, urls)

Relations: guild → channel → confession (cascade deletes)

### Telemetry Pattern

Every async operation should use tracing:

```typescript
const result = await tracer.asyncSpan('operation-name', async span => {
  span.setAttributes({ key: value });
  return await doWork();
});
```

## Code Conventions

- Discriminated unions with explicit `interface` types
- `switch` for union discrimination, not `if` chains
- `const enum` for string constants
- Prefer type inference over explicit return types
- Runtime non-null assertions (no `!` operator)
- Use `assert` from `node:assert/strict` for runtime checks
- Avoid double negation in conditional code

## Environment Variables

Required:

- `DISCORD_PUBLIC_KEY` - Ed25519 public key for webhook verification
- `DISCORD_BOT_TOKEN` - Bot token for API calls
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` - Inngest auth, read directly from runtime environment variables by the SDK
- `POSTGRES_DATABASE_URL` - PostgreSQL connection string

Optional:

- `SPECTRO_DATABASE_DRIVER` - `pg` (default) or `neon` (serverless)
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OpenTelemetry endpoint

## Docker Services

- **db** (port 5432): PostgreSQL
- **inngest** (port 8288): Background job dev server
- **o2** (port 5080): OpenObserve for traces/logs (login: admin@example.com / password)

## Registering Discord Commands

```bash
curl --request 'PUT' \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bot $DISCORD_BOT_TOKEN" \
  --data '@discord.json' \
  "https://discord.com/api/v10/applications/$DISCORD_APPLICATION_ID/commands"
```
