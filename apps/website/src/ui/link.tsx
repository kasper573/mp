import { createLink } from "@tanstack/react-router";
import type { JSX } from "preact";
import { clsx } from "@mp/style";
import * as styles from "./link.css";

export const Link = createLink(LinkComponent);

function LinkComponent({ className, ...props }: JSX.IntrinsicElements["a"]) {
  return <a className={clsx(className, styles.link)} {...props} />;
}
