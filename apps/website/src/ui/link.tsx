import { createLink } from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { clsx } from "@mp/style";
import * as styles from "./link.css";

export const Link = createLink(LinkComponent);

function LinkComponent(props: JSX.IntrinsicElements["a"]) {
  return <a class={clsx(props.class, styles.link)} {...props} />;
}
