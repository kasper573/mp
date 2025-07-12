import type { JSX } from "preact";
import type { StyledComponentProps } from "@mp/style";
import { processStyleProps } from "@mp/style";
import * as styles from "./dock.css";

export type DockProps = JSX.IntrinsicElements["div"] &
  StyledComponentProps<typeof styles.dock>;

export function Dock(props: DockProps) {
  return <div {...processStyleProps(props, styles.dock)} />;
}
