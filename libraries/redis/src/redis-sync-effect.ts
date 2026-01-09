// oxlint-disable no-console
import type { Signal } from "@mp/state";
import type { Type } from "@mp/validate";
import { type } from "@mp/validate";
import type Redis from "ioredis";

/**
 * Synchronizes a signal with a Redis key.
 * If redis updates, the signal value will be changed to the new value from redis.
 * Likewise, if the signal value changes, redis will be updated with the new value.
 *
 * Will use the given arktype to validate the value received from Redis.
 * The signal value will be serialized using JSON.
 */
export function createRedisSyncEffect<T>(
  redis: Redis,
  key: string,
  schema: Type<T>,
  signal: Signal<T>,
  initializeRedisWithValueInSignal = true,
  onParseError?: (error: type.errors) => void,
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

  async function sendValueToRedis(newValue: T) {
    const payload = JSON.stringify(newValue);
    await redis
      .multi()
      .set(key, payload)
      .publish(updateChannel(key), payload)
      .exec();
  }

  function tryReceiveFromRedis(payload: string): boolean {
    const result = schema(JSON.parse(payload));
    if (result instanceof type.errors) {
      onParseError?.(result);
      return false;
    }

    allowSendingSignalValueToRedis = false;
    signal.value = result as T;
    allowSendingSignalValueToRedis = true;
    return true;
  }

  void redis.get(key).then((payload) => {
    if (payload !== null) {
      const failedToReceive = !tryReceiveFromRedis(payload);
      if (failedToReceive && initializeRedisWithValueInSignal) {
        void sendValueToRedis(signal.value);
      }
    } else if (initializeRedisWithValueInSignal) {
      void sendValueToRedis(signal.value);
    }
  });

  void sub.subscribe(updateChannel(key)).then(() => {
    sub.on("message", (channel, payload) => {
      if (channel === updateChannel(key)) {
        tryReceiveFromRedis(payload);
      }
    });
  });

  return function cleanup() {
    stopSubscribingToSignal();
    void sub.unsubscribe(updateChannel(key));
  };
}

export function createRedisWriteEffect<T>(
  redis: Redis,
  key: string,
  signal: Signal<T>,
) {
  async function sendValueToRedis(newValue: T) {
    const payload = JSON.stringify(newValue);
    await redis
      .multi() // Not sure why this is necessary, copy paste from createRedisSyncEffect
      .set(key, payload)
      .publish(updateChannel(key), payload)
      .exec();
  }

  return signal.subscribe(() => void sendValueToRedis(signal.value));
}

export function createRedisReadEffect<T>(
  redis: Redis,
  key: string,
  schema: Type<T>,
  signal: Signal<T>,
  onParseError?: (error: type.errors) => void,
) {
  const sub = redis.duplicate();

  function tryReceiveFromRedis(payload: string): boolean {
    const result = schema(JSON.parse(payload));
    if (result instanceof type.errors) {
      onParseError?.(result);
      return false;
    }

    signal.value = result as T;
    return true;
  }

  void redis.get(key).then((payload) => {
    if (payload !== null) {
      tryReceiveFromRedis(payload);
    }
  });

  void sub.subscribe(updateChannel(key)).then(() => {
    sub.on("message", (channel, payload) => {
      if (channel === updateChannel(key)) {
        tryReceiveFromRedis(payload);
      }
    });
  });

  return function cleanup() {
    void sub.unsubscribe(updateChannel(key));
  };
}

function updateChannel(key: string) {
  return `${key}:update`;
}
