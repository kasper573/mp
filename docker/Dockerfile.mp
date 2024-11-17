FROM node:20.10.0-alpine3.19 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

FROM base AS builder
WORKDIR /usr/mp-src

# install most of node dependencies
COPY pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch

# copy source code and install any node dependencies missed by pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# build application and prepare necessary node_modules for server
ENV NODE_ENV=production
RUN pnpm build 
RUN pnpm deploy --filter=server --prod /usr/pnpm-deploy/server

FROM base AS runner
COPY --from=builder /usr/pnpm-deploy/server /prod/server
COPY --from=builder /usr/mp-src/apps/server/public /prod/public
COPY --from=builder /usr/mp-src/apps/server/dist /prod/server
COPY --from=builder /usr/mp-src/apps/client/dist /prod/client
WORKDIR /prod/server

ENV MP_CLIENT_DIR=/prod/client
ENV MP_PUBLIC_DIR=/prod/public

CMD [ "pnpm", "start" ]