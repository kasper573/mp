import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { processStyleProps, type StyledComponentProps } from "@mp/style";
import * as styles from "./dialog.css";

export type DialogProps = JSX.IntrinsicElements["dialog"] &
  StyledComponentProps<typeof styles.dialog>;

export function Dialog(props: DialogProps) {
  const [local, others] = splitProps(props, ["open"]);
  return (
    <dialog open={local.open} {...processStyleProps(others, styles.dialog)} />
  );
}
