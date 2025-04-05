import type { ParentProps } from "solid-js";
import { ErrorBoundary, Suspense } from "solid-js";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import AppBar from "./AppBar";

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
