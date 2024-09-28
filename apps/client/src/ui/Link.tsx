import type { AnchorProps } from "@solidjs/router";
import { A } from "@solidjs/router";
import * as styles from "./Link.css";

export function Link(props: AnchorProps) {
  return <A classList={{ [styles.link]: true }} {...props} />;
}
