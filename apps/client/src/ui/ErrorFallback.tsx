import { createEffect, Show, useContext } from "npm:solid-js";
import { LoggerContext } from "../logger.ts";

export function ErrorFallback(error: unknown, reset?: () => unknown) {
  const logger = useContext(LoggerContext);

  createEffect(() => logger.error(error));

  return (
    <>
      <h1>Oops! Something went wrong.</h1>
      <Show when={error}>
        <pre>{error instanceof Error ? error.stack : String(error)}</pre>
      </Show>
      {reset && (
        <div>
          <button type="button" onClick={reset}>Try again</button>
        </div>
      )}
    </>
  );
}
