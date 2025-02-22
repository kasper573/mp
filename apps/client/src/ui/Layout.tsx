import type { ParentProps } from "npm:solid-js";
import { ErrorBoundary, Suspense } from "npm:solid-js";
import AppBar from "./AppBar.ts";
import { LoadingSpinner } from "./LoadingSpinner.ts";
import { ErrorFallback } from "./ErrorFallback.ts";

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
