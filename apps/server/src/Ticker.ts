import { TimeSpan } from "@mp/time";

export class Ticker {
  private subscriptions = new Set<TickEventHandler>();
  private intervalId?: NodeJS.Timeout;
  private lastTickTime?: number;

  constructor(private options: TickerOptions) {}

  subscribe(fn: TickEventHandler): Unsubscribe {
    this.subscriptions.add(fn);
    return () => this.subscriptions.delete(fn);
  }

  start() {
    this.stop();
    this.intervalId = setInterval(
      this.tick,
      this.options.interval.totalMilliseconds,
    );
  }

  stop() {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private tick = () => {
    const now = performance.now();
    const deltaMys =
      this.lastTickTime === undefined ? 0 : now - this.lastTickTime;
    this.lastTickTime = now;
    const delta = TimeSpan.fromMilliseconds(deltaMys / 1000);
    this.options.middleware?.({ delta, next: this.emit });
  };

  private emit = (delta: TimeSpan) => {
    for (const fn of this.subscriptions) {
      fn(delta);
    }
  };
}

export interface TickMiddlewareOpts {
  delta: TimeSpan;
  next: (delta: TimeSpan) => void;
}

export type TickMiddleware = (opts: TickMiddlewareOpts) => unknown;

export interface TickerOptions {
  middleware?: TickMiddleware;
  interval: TimeSpan;
}

export type Unsubscribe = () => void;

export type TickEventHandler = (delta: TimeSpan) => void;
