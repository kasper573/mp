import { ok, err, type Result } from "@mp/std";
import type { Signal } from "@mp/state";
import type { Type } from "@mp/validate";
import { type } from "@mp/validate";
import type Redis from "ioredis";
import { encode, decode } from "cbor-x";
import type { TimeSpan } from "@mp/time";

export interface RedisSyncOptions<T> {
  redis: Redis;
  key: string;
  schema: Type<T>;
  signal: Signal<T>;
  onError: (error: Error) => void;
}

/**
 * Synchronizes an arbitrary Redis key and Signal.
 */
export class RedisSync<T> {
  #cleanupFns: CleanupFn[] = [];

  private constructor(private opt: RedisSyncOptions<T>) {}

  /**
   * Immediately load the current value from redis into the signal.
   *
   * Will also reload the the entire set from redis on reconnect.
   */
  load = (): this => {
    const { redis, key } = this.opt;
    const load = () => {
      void redis
        .getBuffer(key)
        .then(this.tryReceiveFromRedis)
        .catch(this.onError);
    };

    // Losing connection may mean missing updates, so reload entire set on reconnect
    redis.on("reconnecting", load);
    this.#cleanupFns.push(() => redis.off("reconnecting", load));

    return this;
  };

  /**
   * Immediately save the current value from the signal into redis.
   */
  save = (): this => {
    const { redis, signal, key } = this.opt;
    const message = encode(signal.value);
    void redis
      .multi()
      .set(key, message)
      .publish(channels.sync(key), message)
      .exec()
      .catch(this.onError);

    return this;
  };

  /**
   * Set to automatically update the signal when redis updates.
   */
  subscribe = (): this => {
    const { redis, key } = this.opt;

    // Must duplicate since connections cannot be used for both commands and pub/sub
    const sub = redis.duplicate();

    this.#cleanupFns.push(
      subscribe(
        sub,
        channels.sync(key),
        this.tryReceiveFromRedis,
        this.onError,
      ),
      () => sub.quit().catch(this.onError),
    );

    return this;
  };

  /**
   * Set to automatically update redis when the signal value changes.
   */
  synchronize = (): this => {
    const { signal } = this.opt;
    this.#cleanupFns.push(signal.subscribe(this.save));
    return this;
  };

  private cleanup: CleanupFn = () =>
    silentInvoke(this.#cleanupFns, this.onError);

  private tryReceiveFromRedis = (message?: Buffer | null): void => {
    if (!message) {
      return;
    }

    const { signal, schema } = this.opt;
    const result = decodeAndParse(message, schema);

    if (result.isErr()) {
      this.onError(result.error);
      return;
    }

    signal.value = result.value;
  };

  private onError = (cause: unknown) =>
    this.opt.onError(new RedisSyncError(this.opt.key, cause));

  static createEffect<T>(
    options: RedisSyncOptions<T>,
    configure: (instance: RedisSync<T>) => RedisSync<T>,
  ): CleanupFn {
    const sync = configure(new RedisSync(options)) as RedisSync<T>;
    return () => sync.cleanup();
  }
}

export class RedisSyncError extends Error {
  constructor(key: string, cause: unknown) {
    super(`RedisSync error for key "${key}"`, { cause });
  }
}

export interface RedisSetSyncOptions<T> {
  redis: Redis;
  key: string;
  signal: Signal<ReadonlySet<T>>;
  onError: (error: Error) => void;
}

/**
 * Synchronizes a set based redis key and signal.
 * Will use optimal redis commands for set operations.
 */
export class RedisSetSync<T extends RedisSetMember> {
  #cleanupFns: CleanupFn[] = [];

  private constructor(private opt: RedisSetSyncOptions<T>) {}

  /**
   * Immediately load the current value from redis into the signal.
   *
   * Will also reload the the entire set from redis on reconnect.
   */
  load = (): this => {
    const { redis, key } = this.opt;

    const load = () => {
      void redis
        .smembers(key)
        .then((members) => (this.opt.signal.value = new Set(members as T[])))
        .catch(this.onError);
    };

    load();

    // Losing connection may mean missing updates, so reload entire set on reconnect
    redis.on("reconnecting", load);
    this.#cleanupFns.push(() => redis.off("reconnecting", load));

    return this;
  };

  /**
   * Immediately save the current value from the signal into redis.
   */
  save = (): this => {
    void this.overwriteRedis(this.opt.signal.value);
    return this;
  };

  /**
   * Set to automatically update the signal when redis updates.
   */
  subscribe = (): this => {
    const { redis, key } = this.opt;

    // Must duplicate since connections cannot be used for both commands and pub/sub
    const sub = redis.duplicate();

    this.#cleanupFns.push(
      subscribe(
        sub,
        channels.overwriteSet(key),
        this.overwriteSignal,
        this.onError,
      ),
      subscribe(sub, channels.addToSet(key), this.addToSignal, this.onError),
      subscribe(
        sub,
        channels.removeFromSet(key),
        this.removeFromSignal,
        this.onError,
      ),
      subscribeToExpireEvents(redis, this.onExpire, this.onError),
      () => sub.quit().catch(this.onError),
    );

    return this;
  };

  /**
   * Set to automatically update redis when the signal value changes.
   */
  synchronize = (): this => {
    const { signal, redis, key } = this.opt;
    let previousSet = signal.value;
    this.#cleanupFns.push(
      signal.subscribe(() => {
        const newSet = signal.value;
        const addedSet = newSet.difference(previousSet);
        const removedSet = previousSet.difference(newSet);
        previousSet = newSet;

        let multi;
        if (addedSet.size) {
          const addedArray = Array.from(addedSet);
          multi ??= redis.multi();
          multi.sadd(key, addedArray);
          multi.publish(channels.addToSet(key), encode(addedArray));
        }
        if (removedSet.size) {
          const removedArray = Array.from(removedSet);
          multi ??= redis.multi();
          multi.srem(key, removedArray);
          multi.publish(channels.removeFromSet(key), encode(removedArray));
        }

        if (multi) {
          void multi.exec().catch(this.onError);
        }
      }),
    );
    return this;
  };

  /**
   * Initialize a heartbeat behavior to automatically expire the redis
   * key after the given time span unless the heartbeat is kept alive.
   */
  heartbeat = (expire: TimeSpan): this => {
    const { redis, key } = this.opt;

    const heartbeat = () =>
      void redis
        .expire(key, Math.round(expire.totalSeconds))
        .catch(this.onError);

    heartbeat();

    const heartbeatInterval = Math.ceil(expire.totalMilliseconds / 2);
    const intervalId = setInterval(heartbeat, heartbeatInterval);
    this.#cleanupFns.push(() => clearInterval(intervalId));
    this.#cleanupFns.push(() => this.overwriteRedis(new Set()));
    return this;
  };

  private cleanup: CleanupFn = () =>
    silentInvoke(this.#cleanupFns, this.onError);

  private overwriteRedis = async (newValue: ReadonlySet<T>) => {
    const { redis, key } = this.opt;
    const newArray = Array.from(newValue);
    const multi = redis.multi().del(key);

    if (newArray.length) {
      multi.sadd(key, newArray);
    }

    await multi
      .publish(channels.overwriteSet(key), encode(newArray))
      .exec()
      .catch(this.onError);
  };

  private overwriteSignal = (arrayAsBuffer: Buffer): void => {
    const result = decodeSafe<T[]>(arrayAsBuffer);

    if (result.isErr()) {
      this.onError(result.error);
      return;
    }

    this.opt.signal.value = new Set(result.value);
  };

  private addToSignal = (arrayAsBuffer: Buffer): void => {
    const result = decodeSafe<T[]>(arrayAsBuffer);

    if (result.isErr()) {
      this.onError(result.error);
      return;
    }

    const { signal } = this.opt;
    signal.value = signal.value.union(new Set(result.value));
  };

  private removeFromSignal = (arrayAsBuffer: Buffer): void => {
    const result = decodeSafe<T[]>(arrayAsBuffer);

    if (result.isErr()) {
      this.onError(result.error);
      return;
    }

    const { signal } = this.opt;
    signal.value = signal.value.difference(new Set(result.value));
  };

  private onExpire = (expiredKey: string) => {
    if (expiredKey === this.opt.key) {
      this.opt.signal.value = new Set();
    }
  };

  private onError = (cause: unknown) =>
    this.opt.onError(new RedisSyncError(this.opt.key, cause));

  static createEffect<T extends RedisSetMember>(
    options: RedisSetSyncOptions<T>,
    configure: (instance: RedisSetSync<T>) => RedisSetSync<T>,
  ): CleanupFn {
    const sync = configure(new RedisSetSync(options)) as RedisSetSync<T>;
    return () => sync.cleanup();
  }
}

function subscribeToExpireEvents(
  redis: Redis,
  handleExpiredKey: (expiredKey: string) => void,
  onError: (error: Error) => void,
) {
  const sub = redis.duplicate();
  const dbIndex = redis.options.db ?? 0;
  const key = `__keyevent@${dbIndex}__:expired`;

  void sub.subscribe(key).catch(onError);

  function onExpire(_channel: string, expiredKey: string) {
    return handleExpiredKey(expiredKey);
  }

  sub.on("message", onExpire);

  return function cleanup() {
    sub.off("message", onExpire);
    void sub.quit().catch(onError);
  };
}

function decodeSafe<T>(messageBuffer: Buffer): Result<T, unknown> {
  try {
    return ok(decode(messageBuffer));
  } catch (decodeError) {
    return err(decodeError);
  }
}

function decodeAndParse<T>(
  messageBuffer: Buffer,
  schema: Type<T>,
): Result<T, unknown> {
  const message = decodeSafe<T>(messageBuffer);
  if (message.isErr()) {
    return err(message.error);
  }

  const parsed = schema(message.value);
  if (parsed instanceof type.errors) {
    return err(parsed);
  }

  return ok(parsed as T);
}

function subscribe(
  redis: Redis,
  channel: string,
  listener: (message: Buffer) => void,
  onError: (error: Error) => void,
) {
  function messageHandler(messageChannel: Buffer, message: Buffer) {
    if (messageChannel.toString("utf8") === channel) {
      listener(message);
    }
  }

  redis.on("messageBuffer", messageHandler);

  void redis.subscribe(channel).catch(onError);

  return () => {
    redis.off("messageBuffer", messageHandler);
    void redis.unsubscribe(channel).catch(onError);
  };
}

async function silentInvoke(
  fns: Array<() => unknown>,
  onError: (error: unknown) => unknown,
) {
  const results = await Promise.allSettled(fns.map((fn) => fn()));
  for (const res of results) {
    if (res.status === "rejected") {
      onError(res.reason);
    }
  }
}

const channels = {
  sync: (key: string) => `${key}:sync`,
  addToSet: (key: string) => `${key}:addToSet`,
  removeFromSet: (key: string) => `${key}:removeFromSet`,
  overwriteSet: (key: string) => `${key}:overwriteSet`,
};

type CleanupFn = () => void;

type RedisSetMember = string;
