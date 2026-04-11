import { WebSocket } from "@mp/ws/client";
import { RiftClient } from "@rift/core";
import { GameClient } from "@rift/modular";
import {
  AreaModule,
  CharacterModule,
  CombatModule,
  InventoryModule,
  MovementModule,
  createWorld,
  type CharacterId,
} from "@mp/world";
import {
  PixiRendererModule,
  PreactRendererModule,
  type PixiRendererApi,
  type PreactRendererApi,
} from "@mp/world/client";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import { env } from "../env";
import { AuthContext, LoggerContext } from "./contexts";

export interface RiftGameClientHandle {
  gameClient: GameClient;
  pixi: PixiRendererApi;
  preact: PreactRendererApi;
  root: HTMLDivElement;
}

export function useRiftGameClient(
  characterId: CharacterId | undefined,
): RiftGameClientHandle | undefined {
  const auth = useContext(AuthContext);
  const logger = useContext(LoggerContext);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [handle, setHandle] = useState<RiftGameClientHandle | undefined>();

  if (!rootRef.current && typeof document !== "undefined") {
    rootRef.current = document.createElement("div");
    rootRef.current.style.position = "absolute";
    rootRef.current.style.inset = "0";
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !characterId) return;
    const accessToken = auth.identity.value?.token;
    if (!accessToken) return;

    const socket = new WebSocket(() => {
      const url = new URL(env.gameServiceUrl);
      url.searchParams.set("accessToken", accessToken);
      url.searchParams.set("characterId", characterId);
      return url.toString();
    });
    socket.binaryType = "arraybuffer";

    const logSocketError = (e: Event) => logger.error(e, "Socket error");
    socket.addEventListener("error", logSocketError);

    const world = createWorld();
    const rift = new RiftClient(world);
    const gameClient = new GameClient({
      modules: [
        AreaModule,
        CharacterModule,
        MovementModule,
        CombatModule,
        InventoryModule,
        PixiRendererModule,
        PreactRendererModule,
      ],
      rift,
      socket,
      root,
      window,
    });

    let disposed = false;
    void gameClient.start().then(() => {
      if (disposed) return;
      setHandle({
        gameClient,
        pixi: gameClient.using(PixiRendererModule),
        preact: gameClient.using(PreactRendererModule),
        root,
      });
    });

    return () => {
      disposed = true;
      setHandle(undefined);
      gameClient.dispose();
      socket.removeEventListener("error", logSocketError);
      socket.close();
    };
  }, [auth, characterId, logger]);

  return handle;
}
