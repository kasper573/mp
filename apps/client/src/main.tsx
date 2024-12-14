import "@fontsource-variable/inter";
import { ErrorBoundary, lazy, Suspense } from "solid-js";
import { render } from "solid-js/web";
import * as styles from "./main.css.ts";
import { LoadingSpinner } from "./ui/LoadingSpinner.tsx";
import { ErrorFallback } from "./ui/ErrorFallback.tsx";
import { dark } from "./style/themes/dark.css.ts";

const App = lazy(() => import("./App.tsx"));

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
  rootElement,
);
