# This is the production server image

FROM node:20.10.0-alpine3.19 AS production
WORKDIR /app

# The app is assumed to have been built on the host machine with `pnpm build` prior to docker build.
# This dockerfile will only copy the build artifacts into the image, bind env vars, and finally initialize the server.

COPY ./apps/server/public /app/public
COPY ./apps/server/dist /app/server
COPY ./apps/client/dist /app/client

ENV MP_PORT=
ENV MP_HOSTNAME=
ENV MP_CORS_ORIGIN=
ENV MP_DATABASE_URL=
ENV MP_AUTH_SECRET_KEY=
ENV MP_BUILD_VERSION=

CMD node --enable-source-maps server/index.mjs \
  --clientDir=/app/client \
  --publicDir=/app/public