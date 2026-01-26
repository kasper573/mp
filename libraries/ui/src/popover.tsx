import { processStyleProps } from "@mp/style";
import * as styles from "./popover.css";
import { Popover } from "@kobalte/core/popover";
import type { JSX, ValidComponent, ParentProps } from "solid-js";

export const PopoverRoot = Popover;
export const PopoverPortal = Popover.Portal;
export const PopoverTrigger = Popover.Trigger;
export const PopoverCloseButton = Popover.CloseButton;

export function PopoverContent(
  props: JSX.IntrinsicElements["div"] & { style?: JSX.CSSProperties },
) {
  return <Popover.Content {...processStyleProps(props, styles.content)} />;
}

export function PopoverArrow(props: JSX.IntrinsicElements["div"]) {
  return <Popover.Arrow {...processStyleProps(props, styles.arrow)} />;
}

export function PopoverClose<T extends ValidComponent = "button">(
  props: ParentProps<{ as?: T; "aria-label"?: string } & Record<string, unknown>>,
) {
  // When used with a custom component (like Link), don't apply close button styling.
  // Don't override aria-label - let the component's content determine the accessible name.
  const isCustomComponent = props.as !== undefined && props.as !== "button";
  const { as, children, ...restProps } = props;
  const processedProps = isCustomComponent
    ? restProps
    : processStyleProps(props, styles.close);

  return (
    // oxlint-disable-next-line no-explicit-any -- Kobalte polymorphic type workaround
    <Popover.CloseButton as={as} {...(processedProps as any)}>
      {children}
    </Popover.CloseButton>
  );
}
