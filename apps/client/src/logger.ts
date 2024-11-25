import { Logger } from "@mp/logger";

/**
 * The root logger for the client.
 * Refrain from logging on this instance directly.
 * Chain from it in each module to create a new logger specific to that module.
 */
export const rootLogger = new Logger(console);
