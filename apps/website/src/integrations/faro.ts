import type { UserIdentity } from "@mp/auth";
import type { ReadonlySignal } from "@mp/state";
import type { Faro, FaroUser } from "@mp/telemetry/faro";

import { env } from "../env";

export function initializeFaro(
  identity: ReadonlySignal<UserIdentity | undefined>,
) {
  let faro: Faro | undefined;

  async function init() {
    // Faro dependencies are large, so we lazy load it.
    const {
      getWebInstrumentations,
      initializeFaro: initializeFaroImpl,
      TracingInstrumentation,
    } = await import("@mp/telemetry/faro");

    faro = initializeFaroImpl({
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
    updateFaroWithIdentity();
  }

  function updateFaroWithIdentity() {
    faro?.api.setUser(deriveFaroUser(identity.value));
  }

  void init();

  return identity.subscribe(updateFaroWithIdentity);
}

function deriveFaroUser(user?: UserIdentity): FaroUser {
  return { id: user?.id, username: user?.name };
}
