import { TimeSpan } from "npm:timespan-ts";
import { beginMeasuringTimeSpan } from "./measure.ts";

export class Ticker {
  private subscriptions = new Set<TickEventHandler>();
  private middleware: TickMiddleware;
  private getTimeSinceLastTick: () => TimeSpan;
  private getTotalTimeElapsed: () => TimeSpan;
  private stopAsyncInterval?: () => void;

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
    this.stopAsyncInterval = setAsyncInterval(this.tick, this.options.interval);
  }

  stop() {
    this.#isEnabled = false;
    this.getTotalTimeElapsed = () => TimeSpan.Zero;
    this.stopAsyncInterval?.();
  }

  private tick = async () => {
    try {
      await this.middleware({
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

  private emit: TickEventHandler = async (...args) => {
    for (const fn of this.subscriptions) {
      await fn(...args);
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

export type TickEventHandler = (event: TickEvent) => void | Promise<void>;

const noopMiddleware: TickMiddleware = ({ next, ...event }) => next(event);

function createDeltaFn(): () => TimeSpan {
  let getMeasurement = beginMeasuringTimeSpan();
  return () => {
    const delta = getMeasurement();
    getMeasurement = beginMeasuringTimeSpan();
    return delta;
  };
}

function setAsyncInterval(handler: () => Promise<void>, interval: TimeSpan) {
  let enabled = true;
  let timeoutId: number;

  function enqueue(lastRunTime: TimeSpan) {
    timeoutId = setTimeout(
      run as () => void,
      interval.subtract(lastRunTime).totalMilliseconds,
    );
  }

  async function run() {
    const stopMeasuring = beginMeasuringTimeSpan();
    await handler();
    if (enabled) {
      enqueue(stopMeasuring());
    }
  }

  function stop() {
    clearTimeout(timeoutId);
    enabled = false;
  }

  enqueue(TimeSpan.Zero);

  return stop;
}
