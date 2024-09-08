import { clsx } from "@mp/style";
import type { HTMLAttributes } from "react";
import * as styles from "./Button.css";

export function Button({
  className,
  ...rest
}: HTMLAttributes<HTMLButtonElement>) {
  return <button className={clsx(styles.button, className)} {...rest} />;
}
