import "dotenv/config";
import { opt } from "./options";
import type { ClientId } from "@mp/game/server";
import { registerEncoderExtensions } from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";
import { WebSocket } from "@mp/ws/server";
import { createRpcInvoker, BinaryRpcTransceiver } from "@mp/rpc";

import { rpcRouter } from "./router";
import { ImmutableInjectionContainer } from "@mp/ioc";
import { RateLimiter } from "@mp/rate-limiter";

// Note that this file is an entrypoint and should not have any exports

registerEncoderExtensions();

const logger = createPinoLogger(opt.prettyLogs);
logger.info(opt, `Starting api...`);

const gatewaySocketUrl = new URL(opt.gatewayWssUrl);
gatewaySocketUrl.searchParams.set("type", "api-server");

logger.info("Creating socket");
const gateway = new WebSocket(gatewaySocketUrl);

gateway.on("close", (e) => {
  logger.error(e, "Gateway socket closed");
});

gateway.on("open", () => logger.info("Gateway socket opened"));
const invoke = createRpcInvoker(rpcRouter);

const globalRequestLimit = new RateLimiter({ points: 20, duration: 1 });

const transceiver = new BinaryRpcTransceiver({
  invoke,
  send: gateway.send.bind(gateway),
  formatResponseError: (error) =>
    opt.exposeErrorDetails ? error : "Internal server error",
});

const ioc = new ImmutableInjectionContainer();

gateway.on("message", async (msg: ArrayBuffer) => {
  let clientId: ClientId | undefined;
  const result = await globalRequestLimit.consume(clientId ?? "unknown-client");
  if (result.isErr()) {
    throw new Error("Rate limit exceeded");
  }

  const out = await transceiver.handleMessage(msg, ioc);
  if (out?.call) {
    const [path, , callId] = out.call;
    logger.info(
      { callId, size: msg.byteLength, path: path.join(".") },
      `[call]`,
    );
    if (out.result.isErr()) {
      logger.error(out.result.error, `[call] ${path.join(".")}`);
    }
  } else if (out?.response) {
    const [callId] = out.response;
    logger.info({ callId }, `[response]`);
    if (out.result.isErr()) {
      logger.error(out.result.error, `[response] (callId: ${callId})`);
    }
  }
});
