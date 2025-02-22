import type { JSX } from "npm:solid-js";
import type { StyledComponentProps } from "../style/processStyleProps.ts";
import { processStyleProps } from "../style/processStyleProps.ts";
import * as styles from "./Dock.css.ts";

export type DockProps =
  & JSX.HTMLAttributes<HTMLDivElement>
  & StyledComponentProps<typeof styles.dock>;

export function Dock(props: DockProps) {
  return <div {...processStyleProps(props, styles.dock)} />;
}
