import { defineModule, toUint8ArrayMessage } from "@rift/modular";
import type { ClientId, Entity, EntityId } from "@rift/core";
import { signal, computed } from "@mp/state";
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
} from "../../components";
import { SessionAssigned } from "../../events";
import { areaModule } from "../area/module";

declare module "@rift/modular" {
  interface ConnectionRequest {
    user?: {
      id: string;
      name: string;
      roles: ReadonlySetLike<string>;
    };
  }
}

export const sessionModule = defineModule({
  dependencies: [areaModule],
  client: (ctx) => {
    const myEntityId = signal<EntityId | undefined>(undefined);
    const isConnected = signal(ctx.socket.readyState === ctx.socket.OPEN);
    const actors = ctx.rift.query(Position, Movement, Combat, Appearance);

    const myEntity = computed(() => {
      const id = myEntityId.value;
      if (id === undefined) return undefined;
      void actors.value;
      return ctx.rift.entity(id);
    });

    const isGameReady = computed(() => myEntity.value !== undefined);

    const areaId = computed<AreaId | undefined>(() => {
      const entity = myEntity.value;
      if (!entity || !entity.has(AreaTag)) return undefined;
      return entity.get(AreaTag).areaId;
    });

    const prevOnOpen = ctx.socket.onopen;
    ctx.socket.onopen = (e) => {
      prevOnOpen?.call(ctx.socket, e);
      isConnected.value = true;
    };

    const prevOnClose = ctx.socket.onclose;
    ctx.socket.onclose = (e) => {
      prevOnClose?.call(ctx.socket, e);
      isConnected.value = false;
      myEntityId.value = undefined;
    };

    const unsubSession = ctx.rift.on(SessionAssigned, (data) => {
      myEntityId.value = data.entityId;
    });

    return {
      api: { myEntityId, myEntity, isConnected, isGameReady, actors, areaId },
      dispose() {
        unsubSession();
        ctx.socket.onopen = prevOnOpen ?? null;
        ctx.socket.onclose = prevOnClose ?? null;
      },
    };
  },
  server: (ctx) => {
    const clientEntities = new Map<ClientId, Entity>();
    const clientRoles = new Map<ClientId, ReadonlySetLike<string>>();
    /** Persists entities across reconnects, keyed by user ID */
    const userEntities = new Map<string, Entity>();
    const defaultAreaId = areas[0].id;
    const { areas: areaMap } = ctx.using(areaModule);

    ctx.wss.on("connection", (socket, request) => {
      const clientId = crypto.randomUUID() as ClientId;
      ctx.addClient(clientId, socket);

      const user = request.user;
      const roles: ReadonlySetLike<string> = user?.roles ?? new Set();
      clientRoles.set(clientId, roles);

      let entity: Entity;

      const existing = user?.id ? userEntities.get(user.id) : undefined;

      if (existing) {
        // Reconnect: rebind existing entity to new client
        entity = existing;
        entity.set(CharacterIdentity, { clientId });
      } else {
        // New session: spawn fresh entity
        const area = areaMap.get(defaultAreaId);
        if (!area) {
          throw new Error(`Default area "${defaultAreaId}" not loaded`);
        }
        entity = ctx.rift.spawn();

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

        if (user?.id) {
          userEntities.set(user.id, entity);
        }
      }

      clientEntities.set(clientId, entity);

      ctx.rift.emit(SessionAssigned, { entityId: entity.id }).to(clientId);

      socket.on("message", (data) => {
        ctx.rift.handleClientEvent(clientId, toUint8ArrayMessage(data));
      });

      socket.on("close", () => {
        ctx.removeClient(clientId);
        clientEntities.delete(clientId);
        clientRoles.delete(clientId);
        // Entity stays alive in userEntities for reconnect
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
          return entity.get(AreaTag).areaId;
        },
        setEntityArea(entity: Entity, areaId: AreaId) {
          entity.set(AreaTag, { areaId });
        },
      },
    };
  },
});
