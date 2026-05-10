import { FeatureRiftClient } from "@rift/feature";
import {
  CharacterList,
  autoRejoinFeature,
  characterListFeature,
  fnv1a64,
  schemaComponents,
  schemaEvents,
  type AutoRejoinIntent,
} from "@mp/world";
import { wsTransport } from "@rift/ws";
import { useEffect, useMemo } from "preact/hooks";
import { useContext } from "preact/hooks";
import { AuthContext } from "./contexts";
import { env } from "../env";

export interface WiredRiftClient {
  readonly client: FeatureRiftClient;
  readonly characters: CharacterList;
}

export function useRiftClient(
  intent: () => AutoRejoinIntent | undefined,
): WiredRiftClient {
  const auth = useContext(AuthContext);

  const wired = useMemo<WiredRiftClient>(() => {
    const url = new URL(env.gameServerUrl);
    url.searchParams.set("accessToken", auth.identity.value?.token ?? "");
    const socket = new WebSocket(url.toString());

    const characters = new CharacterList();

    const client = new FeatureRiftClient({
      transport: wsTransport(socket),
      hash: fnv1a64,
      features: [
        { components: schemaComponents, events: schemaEvents },
        characterListFeature(characters),
        autoRejoinFeature({ intent }),
      ],
    });

    return { client, characters };
  }, [auth, intent]);

  useEffect(() => {
    void wired.client.connect();
    return () => {
      void wired.client.disconnect();
    };
  }, [wired]);

  return wired;
}
