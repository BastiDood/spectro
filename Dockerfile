FROM node:22.15.0-alpine3.20 AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm
RUN pnpm install
COPY . .
ENV PUBLIC_ORIGIN=https://spectro.fly.dev
RUN pnpm build
RUN pnpm prune --prod --ignore-scripts

FROM gcr.io/distroless/nodejs22-debian12:nonroot-amd64 AS deploy
COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/build build/
EXPOSE 3000

# This is the command to start the SvelteKit server. The background email worker
# should be spawned as a separate process somehow. When deploying to Fly.io
# (see the fly.toml), we use Process Groups to spawn both the main SvelteKit
# server and the email worker at the same time. For the sake of supplying a
# # default entry point, the following `CMD` starts the SvelteKit server.
CMD ["build/index.js"]
