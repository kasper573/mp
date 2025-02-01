import type { ParentProps } from "solid-js";
import { ErrorBoundary, Suspense } from "solid-js";
import AppBar from "./AppBar";
import { LoadingSpinner } from "./LoadingSpinner";
import { ErrorFallback } from "./ErrorFallback";

export default function Layout(props: ParentProps) {
  return (
    <>
      <AppBar />
      <ErrorBoundary fallback={ErrorFallback}>
        <Suspense fallback={<LoadingSpinner debugId="Layout" />}>
          {props.children}
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
