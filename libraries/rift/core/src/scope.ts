import type { Entity } from "./entity";
import type { ClientId } from "./server";
import type { RiftType, Infer } from "./types";

export type ScopeResult = boolean | RiftType[];

export interface RiftScope {
  /**
   * Determines the components that the given client can see for a specific entity.
   * If the client should not see the entity at all, return an empty array.
   */
  visibleComponents: (clientId: ClientId, entity: Entity) => RiftType[];

  /**
   * Determines whether an event should be sent to a specific client.
   */
  shouldSendEvent: <T extends RiftType>(
    clientId: ClientId,
    type: T,
    data: Infer<T>,
  ) => boolean;
}

export class PendingEventBuilder<T extends RiftType> {
  constructor(
    private eventList: PendingEvent[],
    private type: T,
    private value: Infer<T>,
  ) {}

  toAll(): void {
    this.eventList.push({
      type: this.type,
      value: this.value,
      shouldSendTo: (clientId, scope) =>
        scope.shouldSendEvent(clientId, this.type, this.value),
    });
  }

  to(...clientIds: ClientId[]): void {
    this.eventList.push({
      type: this.type,
      value: this.value,
      shouldSendTo: (clientId, scope) =>
        clientIds.includes(clientId) &&
        scope.shouldSendEvent(clientId, this.type, this.value),
    });
  }

  toObserversOf(...entities: Entity[]): void {
    this.eventList.push({
      type: this.type,
      value: this.value,
      shouldSendTo: (clientId, scope) => {
        for (const entity of entities) {
          if (scope.visibleComponents(clientId, entity).length > 0) {
            return scope.shouldSendEvent(clientId, this.type, this.value);
          }
        }
        return false;
      },
    });
  }
}

export interface PendingEvent<T extends RiftType = RiftType> {
  readonly type: T;
  readonly value: Infer<T>;
  shouldSendTo(clientId: ClientId, scopeConfig: RiftScope): boolean;
}
