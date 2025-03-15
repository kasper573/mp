import { createContext, createEffect, Show, useContext } from "solid-js";

export function ErrorFallback(error: unknown, reset?: () => unknown) {
  const { handleError } = useContext(ErrorFallbackContext);

  createEffect(() => handleError(error));

  return (
    <>
      <h1>Oops! Something went wrong.</h1>
      <Show when={error}>
        <pre>{error instanceof Error ? error.stack : String(error)}</pre>
      </Show>
      {reset && (
        <div>
          <button onClick={reset}>Try again</button>
        </div>
      )}
    </>
  );
}

export interface ErrorFallbackContextValue {
  handleError: (error: unknown) => void;
}

export const ErrorFallbackContext = createContext<ErrorFallbackContextValue>({
  handleError: () => {
    throw new Error("ErrorFallbackContext must be provided");
  },
});
