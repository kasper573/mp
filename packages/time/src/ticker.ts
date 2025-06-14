import { TimeSpan } from "timespan-ts";
import { beginMeasuringTimeSpan } from "./measure";

export class Ticker {
  private subscriptions = new Set<TickEventHandler>();
  private getTotalTimeElapsed: () => TimeSpan;
  private getTimeSinceLastTick: () => TimeSpan;
  private intervalId?: NodeJS.Timeout;

  constructor(public options: TickerOptions) {
    this.getTotalTimeElapsed = () => TimeSpan.Zero;
    this.getTimeSinceLastTick = () => TimeSpan.Zero;
  }

  subscribe(fn: TickEventHandler): Unsubscribe {
    this.subscriptions.add(fn);
    return () => this.subscriptions.delete(fn);
  }

  start(interval: TimeSpan) {
    if (this.intervalId !== undefined) {
      throw new Error("Ticker is already running");
    }
    this.getTotalTimeElapsed = beginMeasuringTimeSpan();
    this.getTimeSinceLastTick = () => TimeSpan.Zero;
    this.intervalId = setInterval(this.tick, interval.totalMilliseconds);
  }

  stop() {
    this.getTotalTimeElapsed = () => TimeSpan.Zero;
    this.getTimeSinceLastTick = () => TimeSpan.Zero;
    clearInterval(this.intervalId);
    this.intervalId = undefined;
  }

  private tick = () => {
    try {
      const timeSinceLastTick = this.getTimeSinceLastTick();
      const middleware = this.options.middleware ?? noopMiddleware;
      middleware({
        timeSinceLastTick,
        totalTimeElapsed: this.getTotalTimeElapsed(),
        next: this.emit,
      });
    } catch (error) {
      if (this.options.onError) {
        this.options.onError(error);
      } else {
        throw error;
      }
    } finally {
      this.getTimeSinceLastTick = beginMeasuringTimeSpan();
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
}

export type Unsubscribe = () => void;

export type TickEventHandler = (event: TickEvent) => void;

const noopMiddleware: TickMiddleware = ({ next, ...event }) => next(event);
