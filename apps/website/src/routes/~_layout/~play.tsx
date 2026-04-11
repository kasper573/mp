import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { LoadingSpinner } from "@mp/ui";
import {
  CharacterMeta,
  CharacterModule,
  type AreaId,
  type CharacterId,
} from "@mp/world";
import type { Tile } from "@mp/std";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "preact/hooks";
import {
  useAreaResource,
  useAreaSpritesheets,
} from "../../integrations/assets";
import { useRiftGameClient } from "../../integrations/use-rift-game-client";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

const RENDERED_TILE_COUNT = 24 as Tile;

function PlayPage() {
  const qb = useQueryBuilder();
  const { data, isLoading } = useQuery(qb.queryOptions(query));
  const character = data?.myCharacter;

  if (isLoading || !character) {
    return <LoadingSpinner debugDescription="~play.tsx awaiting character" />;
  }
  return <PlayMount characterId={character.id} areaId={character.areaId} />;
}

function PlayMount({
  characterId,
  areaId,
}: {
  characterId: CharacterId;
  areaId: AreaId;
}) {
  const area = useAreaResource(areaId);
  const spritesheets = useAreaSpritesheets(area);
  const handle = useRiftGameClient(characterId);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !handle) return;

    let cancelled = false;
    void handle.pixi.attach(viewport, { interactive: true }).then(() => {
      if (cancelled) return;
      handle.pixi.setArea({
        area,
        areaSpritesheets: spritesheets,
        renderedTileCount: RENDERED_TILE_COUNT,
      });
      viewport.appendChild(handle.root);
      handle.preact.mount(handle.root, <MiscDebugUi />);
    });

    return () => {
      cancelled = true;
      handle.preact.unmount();
      handle.pixi.detach();
      if (handle.root.parentElement === viewport) {
        viewport.removeChild(handle.root);
      }
    };
  }, [handle, area, spritesheets]);

  useEffect(() => {
    if (!handle) return;
    const characters = handle.gameClient.using(CharacterModule);
    const update = () => {
      const entity = characters.findEntity(characterId);
      handle.preact.setLocalCharacterEntityId(entity?.id);
      handle.pixi.setLocalCharacterEntityId(entity?.id);
    };
    update();
    return handle.gameClient.rift.query(CharacterMeta).subscribe(update);
  }, [handle, characterId]);

  return (
    <div
      ref={viewportRef}
      style={{ position: "relative", width: "100%", height: "100%", flex: 1 }}
    />
  );
}

const query = graphql(`
  query PlayPage {
    myCharacter {
      id
      areaId
    }
  }
`);
