import { processStyleProps, type StyledComponentProps } from "@mp/style";
import type { JSX } from "preact/compat";
import { forwardRef } from "preact/compat";
import * as styles from "./link.css";

export type LinkProps = JSX.IntrinsicElements["a"] &
  StyledComponentProps<typeof styles.link>;

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  function Link(props, ref) {
    return <a ref={ref} {...processStyleProps(props, styles.link)} />;
  },
);
