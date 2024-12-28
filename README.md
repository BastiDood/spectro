![Spectro Logotype](./src/lib/brand/logotype/banner-dark.svg)

Spectro is a [Discord bot][spectro-invite-link] that enables your community members to post anonymous confessions and replies to moderator-configured channels. However, for the sake of moderation, confessions are still logged for later viewing.

[spectro-invite-link]: https://discord.com/oauth2/authorize?client_id=1310159012234264617

# Development

Spectro is a standard full-stack [SvelteKit][Svelte] web application that leverages [PostgreSQL] as the database layer.

[Svelte]: https://svelte.dev/
[PostgreSQL]: https://www.postgresql.org/

## Managing Environment Variables

For convenience, the repository includes `env:*` scripts for loading environment variables from `.env.*` files. These are meant to be used as prefixes for other package scripts.

```bash
# Run the database migrations with `.env.development` variables.
pnpm env:dev pnpm db:migrate

# Register the Discord application commands.
pnpm env:prod pnpm discord:register
```

## Managing the Database

Spectro requires a PostgreSQL database for data persistence. For convenience, we use Docker Compose to set up a local installation. The following environment variables are required for this to work.

| **Name**                | **Description**                                                    |
| ----------------------- | ------------------------------------------------------------------ |
| `POSTGRES_DATABASE_URL` | The URL connection string for the PostgreSQL development database. |
| `POSTGRES_PASSWORD`     | The password with which to initialize the default `postgres` user. |

```bash
# Download PostgreSQL with Docker (Compose).
# Run and initialize an empty database.
# Requires `POSTGRES_PASSWORD`.
docker compose --profile=dev up --detach

# Run the database migrations.
# Requires `POSTGRES_DATABASE_URL` already in scope.
pnpm db:migrate

# Shut down the PostgreSQL server.
docker compose --profile=dev down
```

## Registering Callback Endpoints

The bot relies on two callback endpoints that receives webhook events from Discord:

1. The **interactions endpoint** (i.e., [`/webhook/discord/interaction/`][spectro-discord-interaction]) for [receiving application commands][discord-interactions] via HTTP POST requests from Discord.
1. The **webhook events endpoint** (i.e., [`/webhook/discord/event/`][spectro-discord-event]) for receiving [application authorization][discord-application-authorized] events from Discord.

[spectro-discord-interaction]: ./src/routes/webhook/discord/interaction/+server.ts
[spectro-discord-event]: ./src/routes/webhook/discord/event/+server.ts
[discord-interactions]: https://discord.com/developers/docs/interactions/overview#preparing-for-interactions
[discord-application-authorized]: https://discord.com/developers/docs/events/webhook-events#application-authorized

## Registering the Application Commands

To register the application commands in Discord, a one-time initialization script must be run whenever commands are added, modified, or removed. The script is essentially a simple HTTP POST request wrapper over the Discord REST API.

```bash
# Register the application commands.
# Requires `DISCORD_APPLICATION_ID` and `DISCORD_BOT_TOKEN` already in scope.
pnpm discord:register
```

## Running the Web Server

Spectro requires some environment variables to run correctly. If the following table is outdated, a canonical list of variables can be found in the [`src/lib/server/env/*.ts`](./src/lib/server/env/) files.

| **Name**                 | **Description**                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_DATABASE_URL`  | The URL connection string for the PostgreSQL production database.                                                   |
| `DISCORD_APPLICATION_ID` | The publicly known Discord application ID that will be used for the verification of incoming webhooks.              |
| `DISCORD_PUBLIC_KEY`     | The public key of the Discord application that will be used for the verification of incoming webhooks.              |
| `DISCORD_BOT_TOKEN`      | The secret key of the Discord application that will be used for the verification of OAuth2 client credential flows. |

The following variables are optional in development, but _highly_ recommended in the production environment.

| **Name**        | **Description**                                              |
| --------------- | ------------------------------------------------------------ |
| `AXIOM_DATASET` | An Axiom dataset to which structured logs will be delivered. |
| `AXIOM_TOKEN`   | The Axiom token used to authenticate with the ingest.        |

```bash
# Install the dependencies.
pnpm install

# Synchronize auto-generated files from SvelteKit.
pnpm sync

# Start the development server with live reloading + hot module replacement.
pnpm dev

# Compile the production build (i.e., with optimizations).
pnpm build

# Start the production preview server.
pnpm preview
```

## Linting the Codebase

```bash
# Check Formatting
pnpm fmt # prettier

# Apply Formatting Auto-fix
pnpm fmt:fix # prettier --write

# Check Linting Rules
pnpm lint:html   # linthtml
pnpm lint:css    # stylelint
pnpm lint:js     # eslint
pnpm lint:svelte # svelte-check

# Check All Lints in Parallel
pnpm lint
```

## Legal

The Spectro project is licensed under the [GNU Affero General Public License v3.0](./LICENSE). However, some files (e.g., brand assets) are exceptions that have been licensed under different terms and limitations. See the [`COPYING.md`](./COPYING.md) file for more details.

# Acknowledgements

Spectro is dedicated to the hundreds of students at the Department of Computer Science, University of the Philippines - Diliman who rely on anonymous confessions for their daily dose of technical discourse, academic inquiries, heated rants, quick-witted quips, and other social opportunities.

Let Spectro bind the wider computer science community closer together in pursuit of collaboration in the service of our nation.

- For the selfless student leaders keeping the spirit of the department alive.
- For the tireless mentors who frequently share their knowledge and gifts to every academic inquiry.
- For the seasoned veterans and alumni who impart their wisdom about the "real world" out there.
- For the harshest critics of the department who only strive for the quality of education that we deserve.
- For the wittiest comedians who brighten up the otherwise dry discourse.
- For the persevering pupils who exemplify utmost scholarship even in the face of setbacks.
- For the struggling students who nevertheless keep pushing out of passion for their craft.
- For the anonymous lurkers who now feel safer and empowered to participate.

Spectro is here is for you. 👻

---

_Coded with ❤ by [Basti Ortiz][BastiDood]. Themes, designs, and branding by [Jelly Raborar][Anjellyrika]._

[BastiDood]: https://github.com/BastiDood
[Anjellyrika]: https://github.com/Anjellyrika
