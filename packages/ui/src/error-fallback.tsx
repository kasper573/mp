import { createContext } from "preact";
import { useContext, useEffect } from "preact/hooks";

export function ErrorFallback(props: { error: unknown; reset?: () => void }) {
  const context = useContext(ErrorFallbackContext);

  useEffect(() => context.handleError(props.error), [context, props.error]);

  return (
    <>
      <h1>Oops! Something went wrong.</h1>
      {props.error && (
        <pre>
          <ErrorToString error={props.error} />
        </pre>
      )}
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
          {props.error.stack?.includes(props.error.message)
            ? null
            : props.error.message + "\n"}
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
