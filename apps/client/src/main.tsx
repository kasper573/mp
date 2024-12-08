import { dark } from "../../../packages/style/src/themes/dark.css.ts";
import { ErrorBoundary, lazy, Suspense } from "solid-js";
import { render } from "solid-js/web";
import * as styles from "./main.css.ts";
import { LoadingSpinner } from "./ui/LoadingSpinner.ts";
import { ErrorFallback } from "./ui/ErrorFallback.ts";

const App = lazy(() => import("./App"));

document.documentElement.classList.add(dark);

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
