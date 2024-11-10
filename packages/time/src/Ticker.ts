import { TimeSpan } from "timespan-ts";

export class Ticker {
  private subscriptions = new Set<TickEventHandler>();
  private intervalId?: NodeJS.Timeout;
  private middleware: TickMiddleware;

  constructor(private options: TickerOptions) {
    this.middleware = options.middleware ?? noopMiddleware;
  }

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
    const delta = this.options.delta();
    this.middleware({ delta, next: this.emit });
  };

  private emit = (delta: TimeSpan) => {
    for (const fn of this.subscriptions) {
      fn(delta);
    }
  };
}

export function createDynamicDeltaFn(
  getCurrentTimeMS: () => number,
): TickerDeltaFn {
  let last = getCurrentTimeMS();
  return () => {
    const now = getCurrentTimeMS();
    const delta = TimeSpan.fromMilliseconds(now - last);
    last = now;
    return delta;
  };
}

export function createFixedDeltaFn(fixedDelta: TimeSpan): TickerDeltaFn {
  return () => fixedDelta;
}

export type TickerDeltaFn = () => TimeSpan;

export interface TickMiddlewareOpts {
  delta: TimeSpan;
  next: (delta: TimeSpan) => void;
}

export type TickMiddleware = (opts: TickMiddlewareOpts) => unknown;

export interface TickerOptions {
  middleware?: TickMiddleware;
  delta: TickerDeltaFn;
  interval: TimeSpan;
}

export type Unsubscribe = () => void;

export type TickEventHandler = (delta: TimeSpan) => void;

const noopMiddleware: TickMiddleware = ({ delta, next }) => next(delta);
