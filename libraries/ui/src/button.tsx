import type { JSX } from "preact";
import { clsx } from "@mp/style";
import * as styles from "./button.css";
import { forwardRef } from "preact/compat";

export const Button = forwardRef<
  HTMLButtonElement,
  JSX.IntrinsicElements["button"]
>(function Button({ className, ...props }, ref) {
  return (
    <button ref={ref} className={clsx(className, styles.button)} {...props} />
  );
});
