import { Link as TanstackLink } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { clsx } from "@mp/style";
import * as styles from "./Link.css";

function StyledLink({
  className,
  ...rest
}: ComponentProps<typeof TanstackLink>) {
  return <TanstackLink className={clsx(styles.link, className)} {...rest} />;
}

// Retain the original type definition to support typesafe routes
export const Link = StyledLink as unknown as typeof TanstackLink;
