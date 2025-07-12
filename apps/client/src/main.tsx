import "./assets/fonts";
import { dark } from "@mp/style/themes/dark.css";
import { lazy, Suspense } from "preact/compat";
import { render } from "preact";
import {
  ErrorBoundary,
  ErrorFallback,
  ErrorFallbackContext,
  LoadingSpinner,
} from "@mp/ui";
import { assert } from "@mp/std";
import * as styles from "./main.css";

// Note that main.tsx is not the composition root of the application,
// only the entry point that then lazy loads the real composition root, app.tsx.
// This file should have a minimal amount of dependencies to keep the initial load time low.
const App = lazy(() => import("./app"));

document.documentElement.classList.add(dark);

const rootElement = assert(document.querySelector("div#root"));
rootElement.classList.add(styles.root);

render(<Root />, rootElement);

function Root() {
  return (
    <>
      {/* 
        The final error boundary is never really intended to be shown, 
        but it's here for safety so that if the error fallbacks in the inner error boundaries should fall, 
        this serves as a final bastion of hope to display our error message! 
        */}
      <ErrorFallbackContext.Provider
        value={{
          // eslint-disable-next-line no-console
          handleError: console.error,
        }}
      >
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <Suspense fallback={<LoadingSpinner debugId="main" />}>
            <App />
          </Suspense>
        </ErrorBoundary>
      </ErrorFallbackContext.Provider>
    </>
  );
}
