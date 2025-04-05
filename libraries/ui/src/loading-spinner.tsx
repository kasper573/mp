import { container, dot1, dot2, dot3, dot4 } from "./loading-spinner.css";
import { Dock } from "./dock";

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
