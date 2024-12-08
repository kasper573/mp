import type { TimeSpan } from "timespan-ts";
import { measureTimeSpan } from "./measure.ts";

export class Ticker {
  private subscriptions = new Set<TickEventHandler>();
  private intervalId?: number;
  private middleware: TickMiddleware;
  private delta: () => TimeSpan;

  constructor(private options: TickerOptions) {
    this.middleware = options.middleware ?? noopMiddleware;
    this.delta = createDeltaFn();
  }

  subscribe(fn: TickEventHandler): Unsubscribe {
    this.subscriptions.add(fn);
    return () => this.subscriptions.delete(fn);
  }

  start() {
    this.stop();
    this.intervalId = setInterval(
      this.tick,
      this.options.interval.totalMilliseconds
    );
  }

  stop() {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private tick = () => {
    this.middleware({ delta: this.delta(), next: this.emit });
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

const noopMiddleware: TickMiddleware = ({ delta, next }) => next(delta);

function createDeltaFn(): () => TimeSpan {
  let stopMeasuring = measureTimeSpan();
  return () => {
    const delta = stopMeasuring();
    stopMeasuring = measureTimeSpan();
    return delta;
  };
}
