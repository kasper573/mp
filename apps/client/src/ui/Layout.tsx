import type { ParentProps } from "solid-js";
import { ErrorBoundary, Suspense } from "solid-js";
import AppBar from "./AppBar.tsx";
import { LoadingSpinner } from "./LoadingSpinner.tsx";
import { ErrorFallback } from "./ErrorFallback.tsx";

export default function Layout(props: ParentProps) {
  return (
    <>
      <AppBar />
      <ErrorBoundary fallback={ErrorFallback}>
        <Suspense fallback={<LoadingSpinner />}>{props.children}</Suspense>
      </ErrorBoundary>
    </>
  );
}
