# Development

## Environment Variables

Spectro requires some environment variables to run correctly. If the following table is outdated, a canonical list of variables can be found in the [`src/lib/server/env/*.ts`](./src/lib/server/env/) files.

| **Name**                 | **Description**                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_DATABASE_URL`  | The URL connection string of the running PostgreSQL database instance.                                                  |
| `DISCORD_APPLICATION_ID` | The publicly known Discord application ID that will be used for the verification of incoming webhooks and OAuth2 flows. |
| `DISCORD_PUBLIC_KEY`     | The public key of the Discord application that will be used for the verification of incoming webhooks.                  |
| `DISCORD_OAUTH_SECRET`   | The secret key of the Discord application that will be used for the verification of OAuth2 authorization code flows.    |
| `DISCORD_BOT_TOKEN`      | The secret key of the Discord application that will be used for the verification of OAuth2 client credential flows.     |

## Running the Web Server

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
