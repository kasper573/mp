import { TimeSpan } from "./timespan";

export class Ticker {
  #subs: TickEventHandler[] = [];
  #intervalId?: NodeJS.Timeout;

  constructor(public options: TickerOptions) {}

  subscribe(fn: TickEventHandler): Unsubscribe {
    this.#subs.push(fn);
    return () => {
      const index = this.#subs.indexOf(fn);
      if (index !== -1) {
        this.#subs.splice(index, 1);
      }
    };
  }

  start(interval: TimeSpan) {
    if (this.#intervalId !== undefined) {
      throw new Error("Ticker is already running");
    }

    const { middleware = noopMiddleware, onError = rethrow } = this.options;
    let startTime = performance.now();
    let lastTime = startTime;

    // Safe to reuse and mutate the same otions object across ticks thanks to single threaded js
    const opt: TickMiddlewareOpts = {
      timeSinceLastTick: TimeSpan.Zero,
      totalTimeElapsed: TimeSpan.Zero,
      next: this.emit,
    };

    const tickFn = () => {
      const now = performance.now();
      opt.timeSinceLastTick = TimeSpan.fromMilliseconds(now - lastTime);
      opt.totalTimeElapsed = TimeSpan.fromMilliseconds(now - startTime);
      lastTime = now;
      try {
        middleware(opt);
      } catch (err) {
        onError(err);
      }
    };

    this.#intervalId = setInterval(tickFn, interval.totalMilliseconds);
  }
  private emit: TickEventHandler = (event) => {
    const max = this.#subs.length;
    for (let i = 0; i < max; i++) {
      this.#subs[i](event);
    }
  };
  stop() {
    if (this.#intervalId !== undefined) {
      clearInterval(this.#intervalId);
      this.#intervalId = undefined;
    }
  }
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

function rethrow(err: unknown) {
  throw err;
}

const noopMiddleware: TickMiddleware = (opt) => opt.next(opt);
