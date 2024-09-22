import type { JSX } from "solid-js";
import * as styles from "./Button.css";

export function Button(props: JSX.IntrinsicElements["button"]) {
  return <button classList={{ [styles.button]: true }} {...props} />;
}
