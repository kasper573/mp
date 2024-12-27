import type { AuthClient, UserIdentity } from "@mp/auth-client";
import type { Faro, FaroUser } from "@mp/metrics/client";
import {
  faroLoggerHandler,
  getWebInstrumentations,
  initializeFaro,
  TracingInstrumentation,
  W3CTraceContextPropagator,
} from "@mp/metrics/client";
import { useContext, onCleanup, createEffect } from "solid-js";
import { env } from "../env";
import { LoggerContext } from "../logger";

export function createFaroClient() {
  // TODO get traceparent from meta tag and inject into the propagator
  const propagator = new W3CTraceContextPropagator();

  return initializeFaro({
    url: env.faro.receiverUrl,
    app: {
      name: "mp_client_browser",
      version: env.buildVersion,
    },
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation({
        propagator,
        instrumentationOptions: {
          propagateTraceHeaderCorsUrls: [/.*/], // TODO correct
        },
      }),
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
