import { RiftClient } from "@rift/core";
import {
  AutoRejoinModule,
  CharacterListModule,
  InterpolationModule,
  schema,
  type AutoRejoinIntent,
} from "@mp/world";
import { wsTransport } from "@rift/ws";
import { Ticker } from "@mp/graphics";
import { useEffect, useMemo } from "preact/hooks";
import { useContext } from "preact/hooks";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";
import { AuthContext } from "./contexts";
import { env } from "../env";

export interface RiftClientWithModules {
  readonly client: RiftClient;
  readonly characters: CharacterListModule;
  readonly autoRejoin: AutoRejoinModule;
}

export function useRiftClient(intent: () => AutoRejoinIntent | undefined): {
  readonly client: RiftClient;
  readonly characters: CharacterListModule;
} {
  const auth = useContext(AuthContext);

  const wired = useMemo<RiftClientWithModules>(() => {
    const url = new URL(env.gameServerUrl);
    url.searchParams.set("accessToken", auth.identity.value?.token ?? "");
    const socket = new WebSocket(url.toString());

    const characters = new CharacterListModule();
    const autoRejoin = new AutoRejoinModule({ intent });
    const interpolation = new InterpolationModule({
      enabled: () => miscDebugSettings.value.useInterpolator,
      subscribeToFrames: (onFrame) => {
        const handler = (ticker: Ticker) => onFrame(ticker.deltaMS / 1000);
        Ticker.shared.add(handler);
        return () => Ticker.shared.remove(handler);
      },
    });

    const client = new RiftClient({
      schema,
      transport: wsTransport(socket),
      modules: [characters, autoRejoin, interpolation],
    });

    return { client, characters, autoRejoin };
  }, [auth, intent]);

  useEffect(() => {
    void wired.client.connect();
    return () => {
      void wired.client.disconnect();
    };
  }, [wired]);

  return { client: wired.client, characters: wired.characters };
}
