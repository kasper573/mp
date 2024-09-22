import * as styles from "./Link.css";
import { JSX } from "solid-js";

export function Link(props: JSX.IntrinsicElements["a"]) {
  return <a classList={{ [styles.link]: true }} {...props} />;
}
