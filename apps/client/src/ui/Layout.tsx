import type { ParentProps } from "solid-js";
import { ErrorBoundary, Suspense } from "solid-js";
import AppBar from "./AppBar";
import { ErrorFallback } from "./ErrorFallback";
import { Loading } from "./Loading";

export default function Layout(props: ParentProps) {
  return (
    <>
      <AppBar />
      <ErrorBoundary fallback={ErrorFallback}>
        <Suspense fallback={<Loading />}>{props.children}</Suspense>
      </ErrorBoundary>
    </>
  );
}
