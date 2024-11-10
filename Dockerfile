# This is the production server image
FROM node:20.10.0-alpine3.19 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/mp-src
WORKDIR /usr/mp-src
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
ENV NODE_ENV=production
RUN pnpm build 
RUN pnpm deploy --filter=server --prod /usr/pnpm-deploy/server

FROM base AS server
COPY --from=build /usr/pnpm-deploy/server /prod/server
COPY --from=build /usr/mp-src/apps/server/public /prod/public
COPY --from=build /usr/mp-src/apps/server/dist /prod/server
COPY --from=build /usr/mp-src/apps/client/dist /prod/client
WORKDIR /prod/server
EXPOSE 8000

ENV MP_CLIENT_DIR=/prod/client
ENV MP_PUBLIC_DIR=/prod/public

CMD [ "pnpm", "start" ]