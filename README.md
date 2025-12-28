![Spectro Logotype](./src/lib/brand/logotype/banner-dark.svg)

Spectro is a Discord bot that enables your community members to post anonymous confessions and replies to moderator-configured channels. However, for the sake of moderation, confessions are still logged for later viewing.

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

## Managing Local Services

Spectro uses Docker Compose to run local development services:

- **PostgreSQL** (`db`) — The database layer for data persistence (port `5432`).
- **Inngest** (`inngest`) — A local Inngest dev server for background job processing (port `8288`).
- **OpenObserve** (`o2`) — A web UI for visualizing OpenTelemetry traces and logs (port `5080`).

The following environment variables are required for the database to work.

| **Name**                | **Description**                                                    |
| ----------------------- | ------------------------------------------------------------------ |
| `POSTGRES_DATABASE_URL` | The URL connection string for the PostgreSQL development database. |
| `POSTGRES_PASSWORD`     | The password with which to initialize the default `postgres` user. |

```bash
# Start all local development services.
# Requires `POSTGRES_PASSWORD`.
docker compose up --detach

# Run the database migrations.
# Requires `POSTGRES_DATABASE_URL` already in scope.
pnpm db:migrate

# Shut down all local development services.
docker compose down
```

Once running, OpenObserve is accessible at `http://localhost:5080` with the default development credentials:

- **Email**: `admin@example.com`
- **Password**: `password`

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
curl --request 'PUT' --header 'Content-Type: application/json' --header "Authorization: Bot $DISCORD_BOT_TOKEN" --data '@discord.json' "https://discord.com/api/v10/applications/$DISCORD_APPLICATION_ID/commands"
```

> [!NOTE]
> This invocation is implemented as a Nushell script in [`register.nu`](./register.nu).

## Developing Spectro

Spectro requires some environment variables to run correctly. If the following table is outdated, a canonical list of variables can be found in the [`src/lib/server/env/*.ts`](./src/lib/server/env/) files.

| **Name**                  | **Description**                                                                                                     | **Default** |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------- |
| `DISCORD_PUBLIC_KEY`      | The public key of the Discord application that will be used for the verification of incoming webhooks.              |             |
| `DISCORD_BOT_TOKEN`       | The secret key of the Discord application that will be used for the verification of OAuth2 client credential flows. |             |
| `INNGEST_EVENT_KEY`       | The event key used to send events to Inngest.                                                                       |             |
| `INNGEST_SIGNING_KEY`     | The signing key used to verify incoming webhook requests from Inngest.                                              |             |
| `POSTGRES_DATABASE_URL`   | The URL connection string for the PostgreSQL production database.                                                   |             |
| `SPECTRO_DATABASE_DRIVER` | The database driver to use. Accepts `pg` for the standard driver or `neon` for the Neon serverless driver.          | `pg`        |

The following variables are optional in development, but _highly_ recommended in the production environment for [OpenTelemetry](#opentelemetry-instrumentation) integration. The standard environment variables are supported, such as (but not limited to):

| **Name**                      | **Description**                                                                         | **Recommended**                                                |
| ----------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | The base OTLP endpoint URL for exporting logs, metrics, and traces.                     | `http://localhost:5080/api/default`                            |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Extra percent-encoded HTTP headers used for exporting telemetry (e.g., authentication). | `Authorization=Basic%20YWRtaW5AZXhhbXBsZS5jb206cGFzc3dvcmQ%3D` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | The underlying exporter protocol (e.g., JSON, Protobufs, gRPC, etc.).                   | `http/protobuf`                                                |

> [!NOTE]
> The "recommended" values are only applicable to the development environment with OpenObserve running in the background. See the [`compose.yml`] for more details on the OpenObserve configuration.

[`compose.yml`]: ./compose.yml

### Local Telemetry with OpenObserve

To enable full observability in local development:

1. Start the local services (including OpenObserve):

   ```bash
   docker compose up --detach
   ```

2. Export the OTEL environment variables before running the dev server:

   ```bash
   export OTEL_EXPORTER_OTLP_ENDPOINT='http://localhost:5080/api/default'
   export OTEL_EXPORTER_OTLP_HEADERS='Authorization=Basic%20YWRtaW5AZXhhbXBsZS5jb206cGFzc3dvcmQ%3D'
   export OTEL_EXPORTER_OTLP_PROTOCOL='http/protobuf'
   pnpm dev
   ```

3. View traces and logs at `http://localhost:5080`.

In production deployments, the `OTEL_*` variables may be customized to export the telemetry data to external observability providers.

### Running the Web Server

```bash
# Install the dependencies.
pnpm install

# Synchronize auto-generated files from SvelteKit.
# This is automatically run by `pnpm install`.
pnpm prepare

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
pnpm lint:eslint # eslint
pnpm lint:svelte # svelte-check

# Check All Lints in Parallel
pnpm lint
```

## OpenTelemetry Instrumentation

Spectro supports [OpenTelemetry](https://opentelemetry.io/) for distributed tracing and structured logging. The instrumentation is configured in [`src/instrumentation.server.ts`](./src/instrumentation.server.ts), which SvelteKit automatically loads on server startup.

- **Auto-instrumented**: HTTP requests and PostgreSQL queries are automatically traced.
- **Fallback behavior**: When OTLP endpoints are not configured, telemetry falls back to console exporters.
- **Graceful shutdown**: The SDK properly flushes pending telemetry data on server shutdown.

For local development, [OpenObserve](https://openobserve.ai/) is included in the Docker Compose setup (port `5080`) as a web UI for visualizing traces and logs.

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
