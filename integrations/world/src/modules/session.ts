import { defineModule } from "@rift/modular";
import type { ClientId, Entity } from "@rift/core";
import { areas, defaultCharacter } from "@mp/fixtures";
import type { AreaId } from "@mp/fixtures";
import {
  Position,
  Movement,
  Combat,
  Appearance,
  CharacterIdentity,
  Progression,
  AreaTag,
} from "../components";
import { SessionAssigned } from "../events";
import { areaModule } from "./area";

/** Attached to the request by game-service verifyClient */
export interface AuthenticatedRequest {
  __user?: {
    name: string;
    roles: ReadonlySetLike<string>;
  };
}

export const sessionModule = defineModule({
  dependencies: [areaModule],
  server: (ctx) => {
    const clientEntities = new Map<ClientId, Entity>();
    const clientRoles = new Map<ClientId, ReadonlySetLike<string>>();
    const defaultAreaId = areas[0].id;
    const { areas: areaMap } = ctx.using(areaModule);

    ctx.wss.on("connection", (socket, request) => {
      const clientId = crypto.randomUUID() as ClientId;
      ctx.addClient(clientId, socket);

      const user = (request as AuthenticatedRequest)?.__user;
      const roles: ReadonlySetLike<string> = user?.roles ?? new Set();
      clientRoles.set(clientId, roles);

      const area = areaMap.get(defaultAreaId);
      if (!area) {
        throw new Error(`Default area "${defaultAreaId}" not loaded`);
      }
      const entity = ctx.rift.spawn();

      entity.set(Position, area.start);
      entity.set(Movement, {
        speed: defaultCharacter.speed,
        dir: 0,
        moving: false,
      });
      entity.set(Combat, {
        health: defaultCharacter.health,
        maxHealth: defaultCharacter.maxHealth,
        alive: true,
        attackDamage: defaultCharacter.attackDamage,
        attackSpeed: defaultCharacter.attackSpeed,
        attackRange: defaultCharacter.attackRange,
      });
      entity.set(Appearance, {
        modelId: defaultCharacter.modelId,
        name: user?.name ?? "Player",
      });
      entity.set(CharacterIdentity, { clientId });
      entity.set(Progression, { xp: defaultCharacter.xp });
      entity.set(AreaTag, { areaId: defaultAreaId });

      clientEntities.set(clientId, entity);

      ctx.rift.emit(SessionAssigned, { entityId: entity.id }).to(clientId);

      socket.on("message", (data) => {
        const buf =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : data instanceof Uint8Array
              ? data
              : new Uint8Array(
                  ArrayBuffer.isView(data)
                    ? data.buffer
                    : (data as unknown as ArrayBuffer),
                );
        ctx.rift.handleClientEvent(clientId, buf);
      });

      socket.on("close", () => {
        ctx.removeClient(clientId);
        ctx.rift.destroy(entity);
        clientEntities.delete(clientId);
        clientRoles.delete(clientId);
      });
    });

    return {
      api: {
        clientEntities,
        hasRole(clientId: ClientId, role: string): boolean {
          const roles = clientRoles.get(clientId);
          return roles?.has(role) ?? false;
        },
        getEntityArea(entity: Entity): AreaId {
          return entity.get(AreaTag).areaId as AreaId;
        },
        setEntityArea(entity: Entity, areaId: AreaId) {
          entity.set(AreaTag, { areaId });
        },
      },
    };
  },
});
