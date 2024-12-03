![Spectro Logotype](./src/lib/brand/logotype/banner-dark.svg)

Spectro is a [Discord bot][spectro-invite-link] that enables your community members to post anonymous confessions and replies to moderator-configured channels. However, for the sake of moderation, confessions are still logged for later viewing.

[spectro-invite-link]: https://discord.com/oauth2/authorize?client_id=1310159012234264617

# Development

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
# Requires `POSTGRES_DATABASE_URL`.
pnpm db:migrate

# Shut down the PostgreSQL server.
docker compose --profile=dev down
```

## Running the Web Server

Spectro requires some environment variables to run correctly. If the following table is outdated, a canonical list of variables can be found in the [`src/lib/server/env/*.ts`](./src/lib/server/env/) files.

| **Name**                 | **Description**                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_DATABASE_URL`  | The URL connection string for the PostgreSQL production database.                                                       |
| `DISCORD_APPLICATION_ID` | The publicly known Discord application ID that will be used for the verification of incoming webhooks and OAuth2 flows. |
| `DISCORD_PUBLIC_KEY`     | The public key of the Discord application that will be used for the verification of incoming webhooks.                  |
| `DISCORD_OAUTH_SECRET`   | The secret key of the Discord application that will be used for the verification of OAuth2 authorization code flows.    |
| `DISCORD_BOT_TOKEN`      | The secret key of the Discord application that will be used for the verification of OAuth2 client credential flows.     |

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

# Acknowledgements

Spectro is dedicated to the hundreds of students at the Department of Computer Science, University of the Philippines - Diliman who rely on anonymous confessions for their daily dose of technical discourse, academic inquiries, heated rants, quick-witted quips, and other social opportunities.

Let Spectro bind the wider computer science community closer together in pursuit of collaboration in the service of our nation.

- For the selfless student leaders keeping the spirit of the department alive.
- For the tireless mentors who frequently share their knowledge and gifts to every academic inquiry.
- For the seasoned veterans and alumni who impart their wisdom about the "real world" out there.
- For the harshest critics of the department who only strive for the quality of education that we deserve.
- For the wittiest comedians who brighten up the otherwise dry discourse.
- For the anonymous lurkers who now feel safer and empowered to participate.

Spectro is here is for you. 👻

---

_Coded with ❤ by [Basti Ortiz][BastiDood]. Themes, designs, and branding by [Jelly Raborar][Anjellyrika]._

[BastiDood]: https://github.com/BastiDood
[Anjellyrika]: https://github.com/Anjellyrika
