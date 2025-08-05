export interface SyncSchema {
  [key: string]: SyncSchema | null;
}

export type SyncSchemaFor<State> = {
  [K in keyof State]: SyncSchemaNode<State[K]>;
};

export type SyncSchemaNode<T> = T extends object ? SyncSchemaFor<T> : null;
