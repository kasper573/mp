import { Show, type JSX } from "solid-js";
import { dots, dot1, dot2, dot3, dot4, container } from "./loading-spinner.css";
import { Dock } from "./dock";

export type LoadingSpinnerProps =
  // Children is user facing descriptive text or other contentent that communicates to the user what is being loaded.
  // If provided, this should always be displayed.
  | { children: JSX.Element }

  // If no children are provided we must provide a debug id so that
  // it's easy to see where the loading spinner comes from in development
  // Debug id will not be displayed in production
  | { debugId: string };

export function LoadingSpinner(props: LoadingSpinnerProps) {
  const children = () =>
    "children" in props ? (props.children ?? <>&nbsp</>) : undefined;

  const debugId = () =>
    "debugId" in props && showDebugIds ? (
      <>LoadingSpinner debugId: {props.debugId}</>
    ) : undefined;

  return (
    <Dock position="center">
      <div class={container}>
        <div classList={{ [dots]: true }}>
          <div class={dot1} />
          <div class={dot2} />
          <div class={dot3} />
          <div class={dot4} />
        </div>
        <Show when={children()}>{(value) => value()}</Show>
        <Show when={debugId()}>{(value) => value()}</Show>
      </div>
    </Dock>
  );
}

const showDebugIds = !import.meta.env.PROD;
