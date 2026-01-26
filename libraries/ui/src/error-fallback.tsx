import { createContext, useContext, createEffect, Show, type JSXElement } from "solid-js";

export interface ErrorFallbackProps {
  title?: string;
  error: unknown;
  reset?: () => void;
}

export function ErrorFallback(props: ErrorFallbackProps) {
  const { handleError, displayErrorDetails } = useContext(ErrorFallbackContext);

  createEffect(() => {
    handleError(props.error);
  });

  return (
    <>
      <h2>{props.title ?? "Oops! Something went wrong."}</h2>
      <Show when={displayErrorDetails && props.error}>
        <pre>
          <ErrorToString error={props.error} />
        </pre>
      </Show>
      <Show when={props.reset}>
        <div>
          <button onClick={props.reset}>Try again</button>
        </div>
      </Show>
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

export function ErrorToString(props: { error: unknown }): JSXElement {
  if (props.error instanceof Error) {
    return (
      <>
        {props.error.stack?.includes(props.error.message)
          ? null
          : props.error.message + "\n"}
        {props.error.stack}
        <Show when={props.error.cause}>
          <ErrorToString error={props.error.cause} />
        </Show>
      </>
    );
  }

  return <>{String(props.error)}</>;
}
