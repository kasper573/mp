import type { JSX } from "solid-js";
import * as styles from "./Link.css";

export function Link(props: JSX.IntrinsicElements["a"]) {
  return <a classList={{ [styles.link]: true }} {...props} />;
}
