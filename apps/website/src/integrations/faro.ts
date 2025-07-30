import type { UserIdentity } from "@mp/oauth";
import type { ReadonlySignal } from "@mp/state";
import type { Faro, FaroUser } from "@mp/telemetry/faro";
import {
  getWebInstrumentations,
  initializeFaro,
  TracingInstrumentation,
} from "@mp/telemetry/faro";
import { env } from "../env";

export function createFaroClient() {
  return initializeFaro({
    url: env.faro.receiverUrl,
    isolate: true,
    app: {
      name: "mp-website",
      version: env.version,
    },
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation({ instrumentationOptions: env.faro }),
    ],
  });
}

export function createFaroBindings(
  faro: Faro,
  identity: ReadonlySignal<UserIdentity | undefined>,
) {
  function update() {
    faro.api.setUser(deriveFaroUser(identity.value));
  }

  update();
  return identity.subscribe(update);
}

function deriveFaroUser(user?: UserIdentity): FaroUser {
  return { id: user?.id, username: user?.name };
}
