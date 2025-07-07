import type { SyncEntity, SyncMap } from "@mp/sync";
import { type ReadonlyAtom } from "@mp/state";

export function syncEntityToAtomNotifyEffect<Entity extends SyncEntity>(
  atomEntity: ReadonlyAtom<Entity | undefined>,
) {
  const unsubscribeFromAtom = atomEntity.subscribe(onAtomUpdated);
  let unsubscribeFromEntity = () => {};
  let currentEntity: Entity | undefined;

  function onAtomUpdated() {
    const newEntity = atomEntity.get();
    if (!newEntity || currentEntity === currentEntity) {
      return;
    }

    currentEntity = newEntity;
    unsubscribeFromEntity();
    unsubscribeFromEntity = newEntity.subscribe(onEntityUpdated);
  }

  function onEntityUpdated() {
    atomEntity.notify(fakeOldValue as never);
  }

  return function stopEffect() {
    unsubscribeFromAtom();
    unsubscribeFromEntity();
  };
}

export function syncMapToAtomNotifyEffect<K, V>(
  syncMap: SyncMap<K, V>,
  atomMap: ReadonlyAtom<ReadonlyMap<K, V>>,
) {
  return syncMap.subscribe(() => {
    atomMap.notify(fakeOldValue as ReadonlyMap<K, V>);
  });
}

const fakeOldValue = new Proxy(
  {},
  {
    get() {
      throw new Error(
        "This atom was constructed using sync-to-atom, which does not support providing an old value.",
      );
    },
  },
);
