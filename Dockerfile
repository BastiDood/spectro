# syntax=docker/dockerfile:1.28.0

FROM ghcr.io/pnpm/pnpm:12.15.0 AS base

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm install --store-dir /var/cache/pnpm --frozen-lockfile

COPY . .

FROM base AS web

EXPOSE 5173

CMD ["pnpm", "run", "dev", "--strictPort"]

FROM base AS migrate

CMD ["pnpm", "run", "db:migrate"]

FROM base AS studio

EXPOSE 4983

CMD ["pnpm", "run", "db:studio"]
