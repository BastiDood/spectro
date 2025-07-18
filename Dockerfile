FROM node:24.4.1-alpine3.22 AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml svelte.config.js ./
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm
RUN pnpm install
COPY . .
ENV PUBLIC_ORIGIN=https://spectro.fly.dev
RUN pnpm build
RUN pnpm prune --prod --ignore-scripts

FROM gcr.io/distroless/nodejs24-debian12:nonroot-amd64 AS deploy
COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/build build/

# This is the command to start the SvelteKit server. The background email worker
# should be spawned as a separate process somehow. When deploying to Fly.io
# (see the fly.toml), we use Process Groups to spawn both the main SvelteKit
# server and the email worker at the same time. For the sake of supplying a
# default entry point, the following `CMD` starts the SvelteKit server.
EXPOSE 3000
CMD ["build/index.js"]
