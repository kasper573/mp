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
    this.impl[level](
      ...this.prefixes.map(decoratePrefix),
      ...args.map(stringify),
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
