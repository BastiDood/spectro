[windows]
set shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

# Run ESLint and Svelte Check in parallel.
[parallel]
lint: lint-eslint lint-svelte

# Run the ESLint linter.
lint-eslint:
    pnpm run lint:eslint

# Run the Svelte Check linter.
lint-svelte:
    pnpm run lint:svelte

# Start the web development server and dependencies in Docker watch mode.
dev:
    docker compose up --watch

# Stop Docker Compose services in every profile and remove orphaned containers.
stop:
    docker compose --profile '*' down --remove-orphans

# Run pending migrations with Drizzle Kit in its Docker Compose service.
db-migrate:
    docker compose run --rm migrate

# Start Drizzle Studio in its Docker Compose service.
db-studio:
    docker compose up studio
