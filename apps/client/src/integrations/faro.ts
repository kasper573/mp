import type { UserIdentity } from "@mp/auth";
import type { FaroUser } from "@mp/telemetry/faro";
import {
  getWebInstrumentations,
  initializeFaro,
  TracingInstrumentation,
} from "@mp/telemetry/faro";
import { createEffect } from "solid-js";
import { env } from "../env";

export function createFaroClient(identity: () => UserIdentity | undefined) {
  const faro = initializeFaro({
    url: env.faro.receiverUrl,
    isolate: true,
    app: {
      name: "mp_client",
      version: env.buildVersion,
    },
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation({ instrumentationOptions: env.faro }),
    ],
  });

  createEffect(() => faro.api.setUser(deriveFaroUser(identity())));
  return faro;
}

function deriveFaroUser(user?: UserIdentity): FaroUser {
  return { id: user?.id, username: user?.name };
}
