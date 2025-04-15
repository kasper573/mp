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
          <ErrorToString error={props.error} />
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

export function ErrorToString(props: { error: unknown }) {
  return (
    <>
      {props.error instanceof Error ? (
        <>
          <Show when={!props.error.stack?.includes(props.error.message)}>
            {props.error.message + "\n"}
          </Show>
          {props.error.stack}
          {props.error.cause ? (
            <ErrorToString error={props.error.cause} />
          ) : null}
        </>
      ) : (
        String(props.error)
      )}
    </>
  );
}
