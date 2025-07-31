import type { JSX } from "preact";
import { clsx } from "@mp/style";
import * as styles from "./button.css";

export function Button({
  className,
  ...props
}: JSX.IntrinsicElements["button"]) {
  return <button className={clsx(className, styles.button)} {...props} />;
}
