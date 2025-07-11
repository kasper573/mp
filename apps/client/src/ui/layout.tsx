import type { ReactNode } from "react";
import { Suspense } from "react";
import { ErrorBoundary, ErrorFallback, LoadingSpinner } from "@mp/ui";
import AppBar from "./app-bar";

export default function Layout(props: { children?: ReactNode }) {
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
          <Suspense fallback={<LoadingSpinner debugId="Layout" />}>
            {props.children}
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}
