import { themes } from "@mp/style";
import { ErrorBoundary, lazy, Suspense } from "npm:solid-js";
import { render } from "npm:solid-js/web";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import { LoadingSpinner } from "./ui/LoadingSpinner.tsx";
import { ErrorFallback } from "./ui/ErrorFallback.tsx";
import { LoggerContext } from "./logger.ts";
import * as styles from "./main.css.ts";

// Note that main.tsx is not the composition root of the application,
// only the entry point that then lazy loads the real composition root, App.tsx.
// This file should have a minimal amount of dependencies to keep the initial load time low.

const App = lazy(() => import("./App.tsx"));

document.documentElement.classList.add(themes.dark);

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
