FROM node:24.11.1-alpine3.22 AS build
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

EXPOSE 3000
CMD ["build/index.js"]
