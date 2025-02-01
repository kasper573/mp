import { dark } from "@mp/style/themes/dark.css";
import { ErrorBoundary, lazy, Suspense } from "solid-js";
import { render } from "solid-js/web";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import { LoadingSpinner } from "./ui/LoadingSpinner";
import { ErrorFallback } from "./ui/ErrorFallback";
import { LoggerContext } from "./logger";
import * as styles from "./main.css";

// Note that main.tsx is not the composition root of the application,
// only the entry point that then lazy loads the real composition root, App.tsx.
// This file should have a minimal amount of dependencies to keep the initial load time low.

const App = lazy(() => import("./App"));

document.documentElement.classList.add(dark);

const rootElement = document.querySelector("div#root")!;
rootElement.classList.add(styles.root);

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

render(
  () => (
    <LoggerContext.Provider value={logger}>
      <ErrorBoundary fallback={ErrorFallback}>
        <Suspense fallback={<LoadingSpinner />}>
          <App />
        </Suspense>
      </ErrorBoundary>
    </LoggerContext.Provider>
  ),
  rootElement,
);
