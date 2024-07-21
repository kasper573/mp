import chalk from "chalk";

export class Logger {
  constructor(
    private impl: Pick<typeof console, LogLevel>,
    private prefixes: unknown[] = ["tsock"],
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
  return JSON.stringify(value, null, 2);
}

function isPrimitive(value: unknown) {
  return value === null || typeof value !== "object";
}

function decoratePrefix(prefix: unknown) {
  return `[${prefix}]`;
}

const logLevelColors = {
  error: chalk.red,
  info: chalk.blueBright,
  warn: chalk.yellow,
} satisfies Record<LogLevel, (s: string) => string>;
