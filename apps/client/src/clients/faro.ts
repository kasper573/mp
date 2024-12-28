import type { AuthClient, UserIdentity } from "@mp/auth-client";
import type { Faro, FaroUser } from "@mp/telemetry/faro";
import {
  faroLoggerHandler,
  getWebInstrumentations,
  initializeFaro,
  TracingInstrumentation,
} from "@mp/telemetry/faro";
import { useContext, onCleanup, createEffect } from "solid-js";
import { env } from "../env";
import { LoggerContext } from "../logger";

export function createFaroClient() {
  return initializeFaro({
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
}

export function useFaroIntegration(faro: Faro, authClient: AuthClient) {
  const logger = useContext(LoggerContext);
  onCleanup(logger.subscribe(faroLoggerHandler(faro)));
  createEffect(() => faro.api.setUser(deriveFaroUser(authClient.identity())));
}

function deriveFaroUser(user?: UserIdentity): FaroUser {
  return { id: user?.id, username: user?.name };
}
