import { createContext, useContext, onMount, type JSX } from "solid-js";

export interface ErrorFallbackProps {
  title?: string;
  error: unknown;
  reset?: () => void;
}

export function ErrorFallback(props: ErrorFallbackProps) {
  const title = props.title ?? "Oops! Something went wrong.";
  const ctx = useContext(ErrorFallbackContext);

  onMount(() => {
    ctx.handleError(props.error);
  });

  return (
    <>
      <h2>{title}</h2>
      {ctx.displayErrorDetails && props.error && (
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
