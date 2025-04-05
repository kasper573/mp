import type { UserIdentity } from "@mp/auth";
import type { FaroUser } from "@mp/telemetry/faro";
import {
  getWebInstrumentations,
  initializeFaro,
  TracingInstrumentation,
} from "@mp/telemetry/faro";
import { env } from "../env";

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

export function deriveFaroUser(user?: UserIdentity): FaroUser {
  return { id: user?.id, username: user?.name };
}
