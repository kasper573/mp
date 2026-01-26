import { createContext, useContext, createEffect } from "solid-js";
import type { JSX } from "solid-js";

export interface ErrorFallbackProps {
  title?: string;
  error: unknown;
  reset?: () => void;
}

export function ErrorFallback(props: ErrorFallbackProps) {
  const context = useContext(ErrorFallbackContext);

  createEffect(() => {
    context.handleError(props.error);
  });

  return (
    <>
      <h2>{props.title ?? "Oops! Something went wrong."}</h2>
      {context.displayErrorDetails && props.error && (
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
  displayErrorDetails: boolean;
  handleError: (error: unknown) => void;
}

export const ErrorFallbackContext = createContext<ErrorFallbackContextValue>({
  displayErrorDetails: true,
  handleError: () => {
    throw new Error("ErrorFallbackContext must be provided");
  },
});

export function ErrorToString(props: { error: unknown }): JSX.Element {
  if (props.error instanceof Error) {
    return (
      <>
        {props.error.stack?.includes(props.error.message)
          ? null
          : props.error.message + "\n"}
        {props.error.stack}
        {props.error.cause ? <ErrorToString error={props.error.cause} /> : null}
      </>
    );
  }

  return <>{String(props.error)}</>;
}

// SolidJS ErrorBoundary component - wrapper with same API as SolidJS ErrorBoundary
export interface ErrorBoundaryProps {
  fallback: (err: Error, reset: () => void) => JSX.Element;
  children: JSX.Element;
}

import { ErrorBoundary as SolidErrorBoundary } from "solid-js";

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return (
    <SolidErrorBoundary fallback={props.fallback}>
      {props.children}
    </SolidErrorBoundary>
  );
}
