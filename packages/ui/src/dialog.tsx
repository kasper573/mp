import { type JSX } from "solid-js";
import { processStyleProps, type StyledComponentProps } from "@mp/style";
import * as styles from "./dialog.css";

export type DialogProps = JSX.HTMLAttributes<HTMLDialogElement> &
  StyledComponentProps<typeof styles.dialog>;

export function Dialog(props: DialogProps) {
  return (
    <dialog open={props.open} {...processStyleProps(props, styles.dialog)} />
  );
}
