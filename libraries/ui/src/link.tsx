import { processStyleProps, type StyledComponentProps } from "@mp/style";
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import * as styles from "./link.css";

export type LinkProps = JSX.IntrinsicElements["a"] &
  StyledComponentProps<typeof styles.link>;

export function Link(props: LinkProps) {
  const [local, rest] = splitProps(props, ["ref"]);
  return <a ref={local.ref} {...processStyleProps(rest, styles.link)} />;
}
