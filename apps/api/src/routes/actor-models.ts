import type { ActorModelLookup, ActorModel } from "@mp/game/server";
import type { InjectionContainer } from "@mp/ioc";
import { Rect } from "@mp/math";
import type { Tile } from "@mp/std";
import { rpc } from "../integrations/trpc";
import { getActorSpritesheetUrls } from "./actor-spritesheet-urls";

export const actorModels = rpc.procedure.query(({ ctx }) =>
  getActorModels(ctx.ioc),
);

export async function getActorModels(
  ioc: InjectionContainer,
): Promise<ActorModelLookup> {
  return new Map(
    (await getActorSpritesheetUrls(ioc))
      .entries()
      .map(([modelId, spritesheets]) => {
        const model: ActorModel = {
          id: modelId,
          spritesheets,
          // TODO should be read from some meta data on file
          // These values are based on the adventurer model
          hitBox: new Rect(-0.5, -1.5, 1, 2) as Rect<Tile>,
        };
        return [modelId, model] as const;
      }),
  );
}
