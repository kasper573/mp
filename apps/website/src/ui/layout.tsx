import { Suspense, ErrorBoundary, type ParentProps } from "solid-js";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
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
          flex: "1",
          position: "relative",
        }}
      >
        <ErrorBoundary fallback={(err) => <ErrorFallback error={err} />}>
          <Suspense fallback={<LoadingSpinner debugDescription="Layout" />}>
            {props.children}
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}
