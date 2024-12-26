import fs from "node:fs/promises";
import { type LogEntry } from "@mp/logger";
import { schemaFor, t } from "../../trpc";
import { optionalAuth } from "../../middlewares/auth";

export interface TraceProcedureOptions {
  filePath: string;
}

export interface TraceInput {
  buildVersion: string;
  entry: LogEntry;
}

export function createTraceProcedure({ filePath }: TraceProcedureOptions) {
  return t.procedure
    .input(schemaFor<TraceInput>())
    .use(optionalAuth())
    .mutation(
      async ({ input: { buildVersion, entry }, ctx: { sessionId, user } }) => {
        let props: Record<string, unknown>;
        if (entry.type === "error") {
          props = decomposeError(entry.args[0]);
        } else {
          props = { args: entry.args };
        }

        await fs.appendFile(
          filePath,
          // Should match pipeline in promtail.yml
          JSON.stringify({
            ts: new Date().toISOString(),
            buildVersion,
            type: entry.type,
            sessionId,
            userId: user?.id,
            ...props,
          }) + "\n",
          "utf8",
        );
      },
    );
}

function decomposeError(error: unknown): { message: string; stack?: string } {
  if (isErrorLike(error)) {
    return { message: error.message, stack: error.stack };
  } else if (isErrorEventLike(error)) {
    const innerError = decomposeError(error.error);
    return {
      message: error.message ?? innerError.message,
      stack: innerError.stack,
    };
  }
  return { message: String(error) };
}

function isErrorEventLike(v: unknown): v is ErrorEvent {
  return (
    typeof v === "object" &&
    v !== null &&
    "message" in v &&
    "colno" in v &&
    "lineno" in v &&
    "filename" in v
  );
}

function isErrorLike(v: unknown): v is Error {
  return typeof v === "object" && v !== null && "message" in v && "stack" in v;
}
