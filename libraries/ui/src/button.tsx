import type { JSX } from "solid-js";
import * as styles from "./button.css";

export function Button(props: JSX.IntrinsicElements["button"]) {
  return <button classList={{ [styles.button]: true }} {...props} />;
}
