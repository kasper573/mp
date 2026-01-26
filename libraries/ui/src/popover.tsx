import { processStyleProps } from "@mp/style";
import * as styles from "./popover.css";
import { Popover as KobaltePopover } from "@kobalte/core/popover";
import { splitProps } from "solid-js";
import type { JSX } from "solid-js";

export const PopoverRoot = KobaltePopover;
export const PopoverPortal = KobaltePopover.Portal;
export const PopoverTrigger = KobaltePopover.Trigger;

export interface PopoverContentProps {
  ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
  children?: JSX.Element;
  class?: string;
  style?: JSX.CSSProperties;
}

export function PopoverContent(props: PopoverContentProps) {
  const [local, others] = splitProps(props, ["ref"]);
  return (
    <KobaltePopover.Content
      ref={local.ref}
      {...processStyleProps(others, styles.content)}
    />
  );
}

export interface PopoverArrowProps {
  ref?: SVGSVGElement | ((el: SVGSVGElement) => void);
  class?: string;
  style?: JSX.CSSProperties;
}

export function PopoverArrow(props: PopoverArrowProps) {
  const [local, others] = splitProps(props, ["ref"]);
  return (
    <KobaltePopover.Arrow
      ref={local.ref}
      {...processStyleProps(others, styles.arrow)}
    />
  );
}

export interface PopoverCloseProps {
  ref?: HTMLButtonElement | ((el: HTMLButtonElement) => void);
  children?: JSX.Element;
  class?: string;
  style?: JSX.CSSProperties;
}

export function PopoverClose(props: PopoverCloseProps) {
  const [local, others] = splitProps(props, ["ref"]);
  return (
    <KobaltePopover.CloseButton
      ref={local.ref}
      {...processStyleProps(others, styles.close)}
    />
  );
}
