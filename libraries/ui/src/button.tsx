import type { JSX } from "preact";
import type { StyledComponentProps } from "@mp/style";
import { processStyleProps } from "@mp/style";
import * as styles from "./button.css";
import { forwardRef } from "preact/compat";

export type ButtonProps = JSX.IntrinsicElements["button"] &
  StyledComponentProps<typeof styles.button>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(props, ref) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={props.disabled} // processStyleProps does not forward variant props, so we need to forward disabled manually
        {...processStyleProps(props, styles.button)}
      />
    );
  },
);
