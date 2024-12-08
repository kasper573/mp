import type { JSX } from "solid-js";
import type { StyledComponentProps } from "@mp/style";
import { processStyleProps } from "@mp/style";
import * as styles from "./LinearProgress.css.ts";

export type LinearProgressProps = JSX.IntrinsicElements["div"] &
  StyledComponentProps<typeof styles.container>;

export function LinearProgress(props: LinearProgressProps) {
  return (
    <div role="progressbar" {...processStyleProps(props, styles.container)} />
  );
}
