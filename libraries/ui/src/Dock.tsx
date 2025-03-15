import type { JSX } from "solid-js";
import type { StyledComponentProps } from "@mp/style";
import { processStyleProps } from "@mp/style";
import * as styles from "./Dock.css";

export type DockProps = JSX.HTMLAttributes<HTMLDivElement> &
  StyledComponentProps<typeof styles.dock>;

export function Dock(props: DockProps) {
  return <div {...processStyleProps(props, styles.dock)} />;
}
