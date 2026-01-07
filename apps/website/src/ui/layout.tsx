import { Suspense } from "preact/compat";
import { ErrorBoundary, ErrorFallback, LoadingSpinner } from "@mp/ui";
import type { ComponentChildren } from "preact";
import AppBar from "./app-bar";

export default function Layout(props: { children?: ComponentChildren }) {
  return (
    <>
      <AppBar />
      <div
        id="layout"
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          position: "relative",
        }}
      >
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <Suspense fallback={<LoadingSpinner debugDescription="Layout" />}>
            {props.children}
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}
