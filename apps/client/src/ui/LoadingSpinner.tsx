import { atoms } from "../style/atoms.css.ts";
import { container, dot1, dot2, dot3, dot4 } from "./LoadingSpinner.css.ts";

export function LoadingSpinner() {
  return (
    <div classList={{ [container]: true, [dock]: true }}>
      <div class={dot1} />
      <div class={dot2} />
      <div class={dot3} />
      <div class={dot4} />
    </div>
  );
}

const dock = atoms({
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "center",
});
