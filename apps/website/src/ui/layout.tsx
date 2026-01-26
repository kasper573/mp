import { Suspense, ErrorBoundary, type JSX } from "solid-js";
import { ErrorFallback, LoadingSpinner } from "@mp/ui";
import AppBar from "./app-bar";

export default function Layout(props: { children?: JSX.Element }) {
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
        <ErrorBoundary fallback={(err) => <ErrorFallback error={err} />}>
          <Suspense fallback={<LoadingSpinner debugDescription="Layout" />}>
            {props.children}
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}
