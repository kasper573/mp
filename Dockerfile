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
ENV PORT=
ENV HOSTNAME=
ENV CORS_ORIGIN=

CMD pnpm --filter server start \
  --clientDistPath=../client/dist \
  --port=$PORT \
  --hostname=$HOSTNAME \
  --corsOrigin=$CORS_ORIGIN \