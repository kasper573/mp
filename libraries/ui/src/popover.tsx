import { processStyleProps } from "@mp/style";
import * as styles from "./popover.css";
import * as Popover from "@radix-ui/react-popover";
import { forwardRef } from "preact/compat";

export const PopoverRoot = Popover.Root;
export const PopoverPortal = Popover.Portal;
export const PopoverTrigger = Popover.Trigger;

export const PopoverContent = forwardRef<
  HTMLDivElement,
  Popover.PopoverContentProps
>(function PopoverContent(props, ref) {
  return (
    <Popover.Content ref={ref} {...processStyleProps(props, styles.content)} />
  );
});

export const PopoverArrow = forwardRef<
  SVGSVGElement,
  Popover.PopoverArrowProps
>(function PopoverArrow(props, ref) {
  return (
    <Popover.Arrow ref={ref} {...processStyleProps(props, styles.arrow)} />
  );
});

export const PopoverClose = forwardRef<
  HTMLButtonElement,
  Popover.PopoverCloseProps
>(function PopoverClose(props, ref) {
  return (
    <Popover.Close ref={ref} {...processStyleProps(props, styles.close)} />
  );
});
