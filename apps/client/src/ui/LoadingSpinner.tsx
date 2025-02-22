import { container, dot1, dot2, dot3, dot4 } from "./LoadingSpinner.css.ts";
import { Dock } from "./Dock.tsx";

export function LoadingSpinner() {
  return (
    <Dock position="center" classList={{ [container]: true }}>
      <div class={dot1} />
      <div class={dot2} />
      <div class={dot3} />
      <div class={dot4} />
    </Dock>
  );
}
