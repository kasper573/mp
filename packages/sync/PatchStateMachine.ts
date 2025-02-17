import { type Patch } from "immer";
import type { ClientId } from "./shared";
import { PatchObserver } from "./PatchObserver";

export class PatchStateMachine<State extends SyncState> {
  private state: PatchObserver<State>;
  private visibilities: Record<ClientId, ClientVisibility<State> | undefined> =
    {};

  constructor(private options: PatchStateMachineOptions<State>) {
    this.state = new PatchObserver(options.state());
  }

  access = <Result>(
    accessFn: StateHandler<State, Result>,
  ): [Result, ClientPatches] => {
    const { clientIds: getClientIds, clientVisibility: getClientVisibility } =
      this.options;

    const clientIds = Array.from(getClientIds());
    const prevVisibilities: Record<
      ClientId,
      ClientVisibility<State>
    > = Object.fromEntries(
      clientIds.map((clientId) => [
        clientId,
        this.visibilities[clientId] ?? // Reuse last if it exists
          getClientVisibility(clientId, this.state.current), // Derive new if not
      ]),
    );

    const [result, patches] = this.state.update(accessFn);

    const clientPatches: ClientPatches = {};

    for (const clientId of clientIds) {
      const prevVisibility = prevVisibilities[clientId];
      const nextVisibility = getClientVisibility(clientId, this.state.current);

      const patchesForClient: Patch[] = [];

      for (const entityName in this.state.current) {
        const prevIds = prevVisibility[entityName];
        const nextIds = nextVisibility[entityName];

        for (const addedId of nextIds.difference(prevIds)) {
          patchesForClient.push({
            op: "add",
            path: [entityName, idEncoder.encode(addedId)],
            value: this.state.current[entityName][addedId],
          });
        }

        for (const removedId of prevIds.difference(nextIds)) {
          patchesForClient.push({
            op: "remove",
            path: [entityName, idEncoder.encode(removedId)],
          });
        }
      }

      patchesForClient.push(
        ...patches.filter(({ path: [entityName, entityId] }) =>
          nextVisibility[entityName].has(idEncoder.decode(entityId)),
        ),
      );

      this.visibilities[clientId] = nextVisibility;
      if (patchesForClient.length > 0) {
        clientPatches[clientId] = patchesForClient;
      }
    }

    return [result, clientPatches];
  };

  readClientState = (clientId: ClientId): State => {
    const clientReferences = this.options.clientVisibility(
      clientId,
      this.state.current,
    );
    return Object.fromEntries(
      Object.entries(clientReferences).map(
        ([entityName, entityIds]: [string, ReadonlySet<EntityId>]) => {
          const allEntities = this.state.current[entityName];
          const referencedEntities = Object.fromEntries(
            entityIds.values().map((id) => [id, allEntities[id]]),
          );
          return [entityName, referencedEntities];
        },
      ),
    ) as State;
  };
}

const asString = <Ret>(value: PropertyKey): Ret => String(value) as Ret;

const idEncoder = {
  encode: asString,
  decode: asString,
};

export interface PatchStateMachineOptions<State extends SyncState> {
  state: () => State;
  clientVisibility: ClientVisibilityFactory<State>;
  clientIds: () => Iterable<ClientId>;
}

export type ClientVisibilityFactory<State extends SyncState> = (
  clientId: ClientId,
  state: State,
) => ClientVisibility<State>;

export type ClientPatches = Record<ClientId, Patch[]>;

export type StateHandler<State, Result> = (draft: State) => Result;

export type StateAccess<State extends SyncState> = <Result>(
  stateHandler: StateHandler<State, Result>,
) => Result;

export type EntityId = string;

export type EntityLookup = { [entityId: EntityId]: unknown };

export type SyncState = { [entityName: string]: EntityLookup };

export type ClientVisibility<State extends SyncState> = {
  [EntityName in keyof State]: ReadonlySet<keyof State[EntityName]>;
};
