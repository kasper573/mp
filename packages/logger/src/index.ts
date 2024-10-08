import chalk from "chalk";

export class Logger {
  constructor(
    private impl: Pick<typeof console, LogLevel>,
    private prefixes: unknown[] = [],
  ) {}

  info = this.log.bind(this, "info");

  warn = this.log.bind(this, "warn");

  error = this.log.bind(this, "error");

  chain(...newPrefixes: unknown[]) {
    return new Logger(this.impl, [...this.prefixes, ...newPrefixes]);
  }

  private log(level: LogLevel, ...args: unknown[]) {
    const color = logLevelColors[level];
    this.impl[level](
      color(
        [...this.prefixes.map(decoratePrefix), ...args.map(stringify)].join(
          " ",
        ),
      ),
    );
  }
}

type LogLevel = "info" | "warn" | "error";

function stringify(value: unknown) {
  if (isPrimitive(value)) {
    return value;
  }
  if (value instanceof Error) {
    return value.stack;
  }
  return JSON.stringify(value, null, 2);
}

function isPrimitive(value: unknown) {
  return value === null || typeof value !== "object";
}

function decoratePrefix(prefix: unknown) {
  return `[${String(prefix)}]`;
}

const logLevelColors = {
  error: chalk.red,
  info: (v) => v,
  warn: chalk.yellow,
} satisfies Record<LogLevel, (s: string) => string>;
