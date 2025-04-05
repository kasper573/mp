import { createContext, createEffect, Show, useContext } from "solid-js";

export function ErrorFallbackFn(error: unknown, reset: () => void) {
  return <ErrorFallback error={error} reset={reset} />;
}

export function ErrorFallback(props: { error: unknown; reset: () => void }) {
  const context = useContext(ErrorFallbackContext);

  createEffect(() => context.handleError(props.error));

  return (
    <>
      <h1>Oops! Something went wrong.</h1>
      <Show when={props.error}>
        <pre>
          {props.error instanceof Error
            ? props.error.stack
            : String(props.error)}
        </pre>
      </Show>
      {props.reset && (
        <div>
          <button onClick={props.reset}>Try again</button>
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
