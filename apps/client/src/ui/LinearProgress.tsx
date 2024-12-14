import type { JSX } from "solid-js";
import * as styles from "./LinearProgress.css.ts";
import {
  processStyleProps,
  StyledComponentProps,
} from "../style/processStyleProps.ts";

export type LinearProgressProps =
  & JSX.IntrinsicElements["div"]
  & StyledComponentProps<typeof styles.container>;

export function LinearProgress(props: LinearProgressProps) {
  return (
    <div role="progressbar" {...processStyleProps(props, styles.container)} />
  );
}
