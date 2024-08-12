
FROM node:20.10.0-alpine3.19 AS production
WORKDIR /app

# The app is assumed to have been built on the host machine with `pnpm build` prior to docker build.
# This dockerfile will only copy the build artifacts into the image, bind env vars, and finally initialize the server.

COPY ./apps/server/public /app/public
COPY ./apps/server/dist /app/server
COPY ./apps/client/dist /app/client

ENV PORT=
ENV HOSTNAME=
ENV CORS_ORIGIN=

CMD node server \
  --clientDir=/app/client \
  --publicDir=/app/public \
  --port=$PORT \
  --hostname=$HOSTNAME \
  --corsOrigin=$CORS_ORIGIN \