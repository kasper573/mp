// oxlint-disable no-console
import { ok, err, type Result } from "@mp/std";
import type { Signal } from "@mp/state";
import type { Type } from "@mp/validate";
import { type } from "@mp/validate";
import type Redis from "ioredis";
import { encode, decode } from "cbor-x";

/**
 * Synchronizes a signal with a Redis key.
 * If redis updates, the signal value will be changed to the new value from redis.
 * Likewise, if the signal value changes, redis will be updated with the new value.
 *
 * Will use the given arktype to validate the value received from Redis.
 * The signal value will be serialized using cbor.
 */
export function createRedisSyncEffect<T>(
  redis: Redis,
  key: string,
  schema: Type<T>,
  signal: Signal<T>,
  onError: (error: Error) => void,
  initializeRedisWithValueInSignal = true,
) {
  const sub = redis.duplicate();
  let allowSendingSignalValueToRedis = true;
  let hasIgnoredInitialSignalValue = false;

  const stopSubscribingToSignal = signal.subscribe(() => {
    // We only want future updates to the signal
    if (!hasIgnoredInitialSignalValue) {
      hasIgnoredInitialSignalValue = true;
      return;
    }

    if (allowSendingSignalValueToRedis) {
      void sendValueToRedis(signal.value);
    }
  });

  function sendValueToRedis(newValue: T) {
    const message = encode(newValue);
    void redis
      .multi()
      .set(key, message)
      .publish(channels.sync(key), message)
      .exec()
      .catch((cause) =>
        onError(
          new Error(`Could not send value to redis for key "${key}"`, {
            cause,
          }),
        ),
      );
  }

  function tryReceiveFromRedis(message: Buffer): boolean {
    const result = decodeAndParse(message, schema);

    if (result.isErr()) {
      onError(
        new Error(`Could not receive redis sync for key "${key}"`, {
          cause: result.error,
        }),
      );
      return false;
    }

    allowSendingSignalValueToRedis = false;
    signal.value = result.value;
    allowSendingSignalValueToRedis = true;
    return true;
  }

  void redis
    .getBuffer(key)
    .then((message) => {
      if (message !== null) {
        const failedToReceive = !tryReceiveFromRedis(message);
        if (failedToReceive && initializeRedisWithValueInSignal) {
          sendValueToRedis(signal.value);
        }
      } else if (initializeRedisWithValueInSignal) {
        sendValueToRedis(signal.value);
      }
    })
    .catch((cause) =>
      onError(
        new Error(`Could not get initial value for redis sync key "${key}"`, {
          cause,
        }),
      ),
    );

  const unsubscribeFromChannel = subscribe(
    sub,
    channels.sync(key),
    tryReceiveFromRedis,
    onError,
  );

  return function cleanup() {
    stopSubscribingToSignal();
    unsubscribeFromChannel();
  };
}

export function createRedisSetReadEffect<Member extends RedisSetMember>(
  redis: Redis,
  key: string,
  memberSchema: Type<NoInfer<Member>>,
  signal: Signal<ReadonlySet<Member>>,
  onError: (error: Error) => void,
) {
  const sub = redis.duplicate();

  const arraySchema = memberSchema.array();

  function overwriteSet(arrayAsBuffer: Buffer): boolean {
    const result = decodeAndParse(arrayAsBuffer, arraySchema);

    if (result.isErr()) {
      onError(
        new Error(`Could not receive entire redis set in key "${key}"`, {
          cause: result.error,
        }),
      );
      return false;
    }

    signal.value = new Set(result.value);
    return true;
  }

  function addToSet(arrayAsBuffer: Buffer) {
    const result = decodeAndParse(arrayAsBuffer, arraySchema);

    if (result.isErr()) {
      onError(
        new Error(`Could not receive redis set addition in key "${key}"`, {
          cause: result.error,
        }),
      );
      return false;
    }

    signal.value = signal.value.union(new Set(result.value));
    return true;
  }

  function removeFromSet(arrayAsBuffer: Buffer) {
    const result = decodeAndParse(arrayAsBuffer, arraySchema);

    if (result.isErr()) {
      onError(
        new Error(`Could not receive redis set removal in key "${key}"`, {
          cause: result.error,
        }),
      );
      return false;
    }

    signal.value = signal.value.difference(new Set(result.value));
    return true;
  }

  void redis
    .smembers(key)
    .then((members) => {
      signal.value = new Set(members as Member[]);
    })
    .catch((cause) =>
      onError(
        new Error(`Could not initialize redis set from key "${key}"`, {
          cause,
        }),
      ),
    );

  const subscriptions = [
    subscribe(sub, channels.overwriteSet(key), overwriteSet, onError),
    subscribe(sub, channels.addToSet(key), addToSet, onError),
    subscribe(sub, channels.removeFromSet(key), removeFromSet, onError),
  ];

  return function cleanup() {
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
  };
}

export function createRedisSetWriteEffect<T extends RedisSetMember>(
  redis: Redis,
  key: string,
  signal: Signal<ReadonlySet<T>>,
  onError: (error: Error) => void,
  initializeRedisWithValueInSignal = true,
) {
  let previousSet = signal.value;

  if (initializeRedisWithValueInSignal) {
    const initialArray = Array.from(previousSet);
    const multi = redis.multi().del(key);

    if (initialArray.length) {
      multi.sadd(key, initialArray);
    }

    void multi
      .publish(channels.overwriteSet(key), encode(initialArray))
      .exec()
      .catch((cause) =>
        onError(
          new Error(`Failed to update redis with initial set value`, { cause }),
        ),
      );
  }

  return signal.subscribe(() => {
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
      void multi
        .exec()
        .catch((cause) =>
          onError(
            new Error(`Failed to update redis set for key "${key}"`, { cause }),
          ),
        );
    }
  });
}

function decodeAndParse<T>(
  messageBuffer: Buffer,
  schema: Type<T>,
): Result<T, Error> {
  let message;
  try {
    message = decode(messageBuffer);
  } catch (decodeError) {
    return err(
      new Error(`Failed to decode redis message`, { cause: decodeError }),
    );
  }

  const parsed = schema(message);
  if (parsed instanceof type.errors) {
    return err(
      new Error(`Failed to parse redis message: ${parsed.summary}`, {
        cause: parsed,
      }),
    );
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

  void redis
    .subscribe(channel)
    .then(() => redis.on("messageBuffer", messageHandler))
    .catch((cause) =>
      onError(
        new Error(`Failed to subscribe to redis channel "${channel}"`, {
          cause,
        }),
      ),
    );

  return () => {
    redis.off("messageBuffer", messageHandler);
    void redis.unsubscribe(channel).catch((cause) =>
      onError(
        new Error(`Failed to unsubscribe from redis channel "${channel}"`, {
          cause,
        }),
      ),
    );
  };
}

type RedisSetMember = string | number;

const channels = {
  sync: (key: string) => `${key}:sync`,
  addToSet: (key: string) => `${key}:addToSet`,
  removeFromSet: (key: string) => `${key}:removeFromSet`,
  overwriteSet: (key: string) => `${key}:overwriteSet`,
};
