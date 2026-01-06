import { createContext } from "preact";
import { useContext, useEffect } from "preact/hooks";

export interface ErrorFallbackProps {
  title?: string;
  error: unknown;
  reset?: () => void;
}

export function ErrorFallback({
  title = "Oops! Something went wrong.",
  error,
  reset,
}: ErrorFallbackProps) {
  const { handleError, displayErrorDetails } = useContext(ErrorFallbackContext);

  useEffect(
    () => handleError(error),
    // oxlint-disable-next-line exhaustive-deps It's fine, we only want to emit the error to the current available handler.
    [error],
  );

  return (
    <>
      <h2>{title}</h2>
      {displayErrorDetails && error && (
        <pre>
          <ErrorToString error={error} />
        </pre>
      )}
      {reset && (
        <div>
          <button onClick={reset}>Try again</button>
        </div>
      )}
    </>
  );
}

export interface ErrorFallbackContextValue {
  displayErrorDetails: boolean;
  handleError: (error: unknown) => void;
}

export const ErrorFallbackContext = createContext<ErrorFallbackContextValue>({
  displayErrorDetails: true,
  handleError: () => {
    throw new Error("ErrorFallbackContext must be provided");
  },
});

export function ErrorToString({ error }: { error: unknown }) {
  if (error instanceof Error) {
    return (
      <>
        {error.stack?.includes(error.message) ? null : error.message + "\n"}
        {error.stack}
        {error.cause ? <ErrorToString error={error.cause} /> : null}
      </>
    );
  }

  return String(error);
}
