import { TimeSpan } from "@mp/time";

export function setAsyncInterval(
  operation: (delta: TimeSpan) => Promise<unknown>,
  interval: TimeSpan,
) {
  let isRunning = true;
  let lastTick = performance.now();

  async function tick() {
    const thisTick = performance.now();
    const tickDelta = TimeSpan.fromMilliseconds(thisTick - lastTick);
    lastTick = thisTick;
    await operation(tickDelta);

    if (isRunning) {
      const nextTick = Math.max(
        0,
        interval.totalMilliseconds - tickDelta.totalMilliseconds,
      );
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      setTimeout(tick, nextTick);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  setTimeout(tick, interval.totalMilliseconds);

  return () => {
    isRunning = false;
  };
}
