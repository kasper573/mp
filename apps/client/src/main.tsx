import { dark } from "@mp/style/themes/dark.css";
import { ErrorBoundary, lazy, Suspense } from "solid-js";
import { render } from "solid-js/web";
import * as styles from "./main.css";
import { Loading } from "./ui/Loading";
import { ErrorFallback } from "./ui/ErrorFallback";

const App = lazy(() => import("./App"));

document.documentElement.classList.add(dark);

const rootElement = document.querySelector("div#root")!;
rootElement.classList.add(styles.root);

render(
  () => (
    <ErrorBoundary fallback={ErrorFallback}>
      <Suspense fallback={<Loading />}>
        <App />
      </Suspense>
    </ErrorBoundary>
  ),
  rootElement,
);
