FROM node:20.10.0-alpine3.19

WORKDIR /app

COPY package.json .
RUN npm install -g $(node -p "require('./package.json').packageManager")

COPY . .
RUN pnpm install

# Client build args
ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV
ARG MP_SERVER_URL
ENV MP_SERVER_URL=$MP_SERVER_URL

RUN pnpm build

# Server args
ENV MP_WS_PORT=
ENV MP_HTTP_PORT=
ENV MP_HTTP_PUBLIC_HOSTNAME=
ENV MP_HTTP_CORS_ORIGIN=

CMD pnpm --filter server start \
  --clientDistPath=../client/dist \
  --wsPort=$MP_WS_PORT \
  --httpPort=$MP_HTTP_PORT \
  --httpPublicHostname=$MP_HTTP_PUBLIC_HOSTNAME \
  --httpCorsOrigin=$MP_HTTP_CORS_ORIGIN \