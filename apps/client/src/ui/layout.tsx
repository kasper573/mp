import type { ParentProps } from "solid-js";
import { ErrorBoundary, Suspense } from "solid-js";
import { ErrorFallbackFn, LoadingSpinner } from "@mp/ui";
import AppBar from "./app-bar";

export default function Layout(props: ParentProps) {
  return (
    <>
      <AppBar />
      <div
        id="layout"
        style={{
          display: "flex",
          "flex-direction": "column",
          flex: 1,
          position: "relative",
        }}
      >
        <ErrorBoundary fallback={ErrorFallbackFn}>
          <Suspense fallback={<LoadingSpinner debugId="Layout" />}>
            {props.children}
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}
