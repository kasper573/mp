import type { ParentProps } from "solid-js";
import { dots, dot1, dot2, dot3, dot4, container } from "./loading-spinner.css";
import { Dock } from "./dock";

export function LoadingSpinner(props: ParentProps) {
  return (
    <Dock position="center">
      <div class={container}>
        <div classList={{ [dots]: true }}>
          <div class={dot1} />
          <div class={dot2} />
          <div class={dot3} />
          <div class={dot4} />
        </div>
        {props.children ?? <>&nbsp;</>}
      </div>
    </Dock>
  );
}
