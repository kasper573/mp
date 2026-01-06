import type { JSX } from "preact";
import type { StyledComponentProps } from "@mp/style";
import { processStyleProps } from "@mp/style";
import * as styles from "./card.css";

export type CardProps = JSX.IntrinsicElements["div"] &
  StyledComponentProps<typeof styles.card>;

export function Card(props: CardProps) {
  return <div {...processStyleProps(props, styles.card)} />;
}
