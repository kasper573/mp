import { createLink } from "@tanstack/solid-router";
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { clsx } from "@mp/style";
import * as styles from "./link.css";

export const Link = createLink(LinkComponent);

function LinkComponent(props: JSX.IntrinsicElements["a"]) {
  const [local, others] = splitProps(props, ["class"]);
  return <a class={clsx(local.class, styles.link)} {...others} />;
}
