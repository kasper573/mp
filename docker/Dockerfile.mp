FROM denoland/deno:2.1.3 AS base

FROM base AS builder
WORKDIR /workdir

COPY . .
RUN deno install
ENV NODE_ENV=development

# TODO build for alpine
RUN deno task build

# TODO use alpine
FROM base AS runner
WORKDIR /workdir

COPY --from=builder /workdir/apps/client/dist /workdir/client
COPY --from=builder /workdir/apps/server/public /workdir/public
COPY --from=builder /workdir/apps/server/server /workdir/

ENV MP_SERVER_PUBLIC_DIR=/workdir/public

CMD [ "./server" ]
