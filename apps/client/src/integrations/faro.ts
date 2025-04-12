import type { UserIdentity } from "@mp/auth";
import type { FaroUser } from "@mp/telemetry/faro";
import {
  faroLoggerHandler,
  getWebInstrumentations,
  initializeFaro,
  TracingInstrumentation,
} from "@mp/telemetry/faro";
import type { Logger } from "@mp/logger";
import { consoleLoggerHandler } from "@mp/logger";
import { onCleanup, createEffect } from "solid-js";
import { env } from "../env";

export function init(logger: Logger, identity: () => UserIdentity | undefined) {
  const faro = initializeFaro({
    url: env.faro.receiverUrl,
    app: {
      name: "mp_client",
      version: env.buildVersion,
    },
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation({ instrumentationOptions: env.faro }),
    ],
  });

  logger.subscribe(consoleLoggerHandler(console));
  onCleanup(logger.subscribe(faroLoggerHandler(faro)));
  createEffect(() => faro.api.setUser(deriveFaroUser(identity())));
}

function deriveFaroUser(user?: UserIdentity): FaroUser {
  return { id: user?.id, username: user?.name };
}
