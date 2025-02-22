import { TimeSpan } from "timespan-ts";
import { beginMeasuringTimeSpan } from "./measure";

export class Ticker {
  private subscriptions = new Set<TickEventHandler>();
  private intervalId?: NodeJS.Timeout;
  private middleware: TickMiddleware;
  private getTimeSinceLastTick: () => TimeSpan;
  private getTotalTimeElapsed: () => TimeSpan;

  #isEnabled = false;
  get isEnabled() {
    return this.#isEnabled;
  }

  constructor(private options: TickerOptions) {
    this.middleware = options.middleware ?? noopMiddleware;
    this.getTimeSinceLastTick = createDeltaFn();
    this.getTotalTimeElapsed = () => TimeSpan.Zero;
  }

  subscribe(fn: TickEventHandler): Unsubscribe {
    this.subscriptions.add(fn);
    return () => this.subscriptions.delete(fn);
  }

  start() {
    this.stop();
    this.#isEnabled = true;
    this.getTotalTimeElapsed = beginMeasuringTimeSpan();
    this.intervalId = setInterval(
      this.tick,
      this.options.interval.totalMilliseconds,
    );
  }

  stop() {
    this.#isEnabled = false;
    this.getTotalTimeElapsed = () => TimeSpan.Zero;
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private tick = () => {
    try {
      this.middleware({
        timeSinceLastTick: this.getTimeSinceLastTick(),
        totalTimeElapsed: this.getTotalTimeElapsed(),
        next: this.emit,
      });
    } catch (error) {
      if (this.options.onError) {
        this.options.onError(error);
      } else {
        throw error;
      }
    }
  };

  private emit: TickEventHandler = (...args) => {
    for (const fn of this.subscriptions) {
      fn(...args);
    }
  };
}

export interface TickEvent {
  timeSinceLastTick: TimeSpan;
  totalTimeElapsed: TimeSpan;
}

export interface TickMiddlewareOpts extends TickEvent {
  next: TickEventHandler;
}

export type TickMiddleware = (opts: TickMiddlewareOpts) => unknown;

export interface TickerOptions {
  onError?: (error: unknown) => void;
  middleware?: TickMiddleware;
  interval: TimeSpan;
}

export type Unsubscribe = () => void;

export type TickEventHandler = (event: TickEvent) => void;

const noopMiddleware: TickMiddleware = ({ next, ...event }) => next(event);

function createDeltaFn(): () => TimeSpan {
  let getMeasurement = beginMeasuringTimeSpan();
  return () => {
    const delta = getMeasurement();
    getMeasurement = beginMeasuringTimeSpan();
    return delta;
  };
}
