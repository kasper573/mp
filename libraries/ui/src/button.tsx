import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import type { StyledComponentProps } from "@mp/style";
import { processStyleProps } from "@mp/style";
import * as styles from "./button.css";

export type ButtonProps = JSX.IntrinsicElements["button"] &
  StyledComponentProps<typeof styles.button>;

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["ref"]);
  return (
    <button
      ref={local.ref}
      type="button"
      disabled={props.disabled}
      {...processStyleProps(rest, styles.button)}
    />
  );
}
