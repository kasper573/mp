import { FeatureRiftClient } from "@rift/feature";
import {
  CharacterList,
  autoRejoinFeature,
  characterListFeature,
  fnv1a64,
  InterpolationLayer,
  interpolationFeature,
  schemaComponents,
  schemaEvents,
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
  readonly client: FeatureRiftClient;
  readonly characters: CharacterList;
  readonly interpolation: InterpolationLayer;
}

export function useRiftClient(intent: () => AutoRejoinIntent | undefined): {
  readonly client: FeatureRiftClient;
  readonly characters: CharacterList;
  readonly interpolation: InterpolationLayer;
} {
  const auth = useContext(AuthContext);

  const wired = useMemo<RiftClientWithModules>(() => {
    const url = new URL(env.gameServerUrl);
    url.searchParams.set("accessToken", auth.identity.value?.token ?? "");
    const socket = new WebSocket(url.toString());

    const characters = new CharacterList();
    const interpolation = new InterpolationLayer();

    const client = new FeatureRiftClient({
      transport: wsTransport(socket),
      hash: fnv1a64,
      features: [
        { components: schemaComponents, events: schemaEvents },
        characterListFeature(characters),
        autoRejoinFeature({ intent }),
        interpolationFeature(interpolation, {
          enabled: () => miscDebugSettings.value.useInterpolator,
          subscribeToFrames: (onFrame) => {
            const handler = (ticker: Ticker) => onFrame(ticker.deltaMS / 1000);
            Ticker.shared.add(handler);
            return () => Ticker.shared.remove(handler);
          },
        }),
      ],
    });

    return { client, characters, interpolation };
  }, [auth, intent]);

  useEffect(() => {
    void wired.client.connect();
    return () => {
      void wired.client.disconnect();
    };
  }, [wired]);

  return {
    client: wired.client,
    characters: wired.characters,
    interpolation: wired.interpolation,
  };
}
