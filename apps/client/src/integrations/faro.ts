import type { UserIdentity } from "@mp/auth";
import type { Faro, FaroUser } from "@mp/telemetry/faro";
import {
  getWebInstrumentations,
  initializeFaro,
  TracingInstrumentation,
} from "@mp/telemetry/faro";
import type { ReadonlyObservable } from "@mp/state";
import { env } from "../env";

export function createFaroClient() {
  return initializeFaro({
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
}

export function createFaroBindings(
  faro: Faro,
  identity: ReadonlyObservable<UserIdentity | undefined>,
) {
  function update() {
    faro.api.setUser(deriveFaroUser(identity.get()));
  }

  update();
  return identity.subscribe(update);
}

function deriveFaroUser(user?: UserIdentity): FaroUser {
  return { id: user?.id, username: user?.name };
}
