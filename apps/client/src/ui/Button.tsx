import type { JSX } from "solid-js";
import * as styles from "./Button.css.ts";

export function Button(props: JSX.IntrinsicElements["button"]) {
  return <button classList={{ [styles.button]: true }} {...props} />;
}
