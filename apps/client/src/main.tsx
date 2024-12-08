import "@fontsource-variable/inter";
import { themes } from "@mp/style";
import { ErrorBoundary, lazy, Suspense } from "solid-js";
import { render } from "solid-js/web";
import * as styles from "./main.css.ts";
import { LoadingSpinner } from "./ui/LoadingSpinner.tsx";
import { ErrorFallback } from "./ui/ErrorFallback.tsx";

const App = lazy(() => import("./App.tsx"));

document.documentElement.classList.add(themes.dark);

const rootElement = document.querySelector("div#root")!;
rootElement.classList.add(styles.root);

render(
  () => (
    <ErrorBoundary fallback={ErrorFallback}>
      <Suspense fallback={<LoadingSpinner />}>
        <App />
      </Suspense>
    </ErrorBoundary>
  ),
  rootElement
);
