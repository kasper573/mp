FROM node:20.10.0-alpine3.19 AS builder
WORKDIR /builder

COPY package.json .
RUN npm install -g $(node -p "require('./package.json').packageManager")

COPY . .
RUN pnpm install

ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV
ARG MP_SERVER_URL
ENV MP_SERVER_URL=$MP_SERVER_URL

RUN pnpm build


FROM node:20.10.0-alpine3.19 AS app
WORKDIR /app

COPY --from=builder /builder/apps/server/public /app/public
COPY --from=builder /builder/apps/server/dist /app/server
COPY --from=builder /builder/apps/client/dist /app/client

ENV PORT=
ENV HOSTNAME=
ENV CORS_ORIGIN=

CMD node server \
  --clientDir=/app/client \
  --publicDir=/app/public \
  --port=$PORT \
  --hostname=$HOSTNAME \
  --corsOrigin=$CORS_ORIGIN \