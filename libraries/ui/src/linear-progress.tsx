import type { JSX } from "preact";
import type { StyledComponentProps } from "@mp/style";
import { processStyleProps } from "@mp/style";
import * as styles from "./linear-progress.css";

export type LinearProgressProps = JSX.IntrinsicElements["div"] &
  StyledComponentProps<typeof styles.container>;

export function LinearProgress(props: LinearProgressProps) {
  return (
    <div role="progressbar" {...processStyleProps(props, styles.container)} />
  );
}
