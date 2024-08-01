import type { Loadable } from "@mp/excalibur";

export class WaitUntil implements Loadable<void> {
  data: void = undefined;
  private isResolved = false;
  private promise?: Promise<void>;

  constructor(
    private condition: () => Promise<boolean>,
    private interval = 100,
  ) {}

  async load() {
    this.promise ??= poll(this.condition, this.interval);
    try {
      await this.promise;
    } finally {
      this.isResolved = true;
    }
  }

  isLoaded() {
    return this.isResolved;
  }
}

function poll(
  condition: () => Promise<boolean>,
  interval: number,
): Promise<void> {
  return new Promise((resolve) => {
    async function attempt() {
      if (await condition()) {
        resolve();
      } else {
        setTimeout(attempt, interval);
      }
    }
    attempt();
  });
}
