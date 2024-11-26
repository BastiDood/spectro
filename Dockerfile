FROM node:22.11.0-alpine3.20 AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm
WORKDIR /app
COPY pnpm-lock.yaml .
RUN pnpm fetch
COPY . .
RUN pnpm install --offline
RUN pnpm --prod deploy /prod
RUN pnpm build && mv build/ /prod

FROM gcr.io/distroless/nodejs22-debian12:nonroot-amd64 AS deploy
COPY --from=build /prod ~/app
EXPOSE 3000

# This is the command to start the SvelteKit server. The background email worker
# should be spawned as a separate process somehow. When deploying to Fly.io
# (see the fly.toml), we use Process Groups to spawn both the main SvelteKit
# server and the email worker at the same time. For the sake of supplying a
# # default entry point, the following `CMD` starts the SvelteKit server.
CMD ["~/app/build/index.js"]
