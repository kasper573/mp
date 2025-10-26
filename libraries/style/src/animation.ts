import type {
  PropertiesHyphen as CSSProperties,
  DataType,
  Property,
} from "csstype";
import { flattened } from "./flattened";
import * as tokens from "./tokens";

/**
 * Typesafe and design token compliant way of defining css transitions.
 *
 * Usage:
 *
 * import { cssForTransition, style } from "@mp/style";
 *
 * const myStyle = style({
 *   transition: cssForTransition(["opacity", "standard.enter"])
 * })
 */
export function cssForTransition(...transitions: Transition[]) {
  return transitions
    .flatMap(([propertyNameOrNames, preset]) => {
      const propertyNames = Array.isArray(propertyNameOrNames)
        ? propertyNameOrNames
        : [propertyNameOrNames];
      return propertyNames.map(
        (property) =>
          `${String(property)} ${String(transitionPresetValues[preset])}`,
      );
    })
    .join(", ");
}

/**
 * Typesafe and design token compliant way of defining css animations.
 *
 * Usage:
 *
 * import { cssForAnimation, style } from "@mp/style";
 *
 * const myStyle = style({
 *   animation: cssForAnimation([enter, "long1", "emphasized", { count: 1 }]),
 * })
 */
export function cssForAnimation(...animations: Animation[]) {
  return animations
    .map(
      ([
        animationName,
        durationPreset,
        easingPreset,
        {
          count = "infinite" as const,
          fill = "forwards" as const,
          direction = "normal" as const,
        } = {},
      ]) => {
        return [
          animationName,
          tokens.durations[durationPreset],
          tokens.easings[easingPreset],
          count,
          fill,
          direction,
        ]
          .filter(Boolean)
          .join(" ");
      },
    )
    .join(", ");
}

export type Animation = [
  animationName: string,
  durationPreset: tokens.Duration,
  easingPreset: tokens.Easing,
  options?: AnimationOptions,
];

export interface AnimationOptions {
  count?: Property.AnimationIterationCount;
  direction?: DataType.SingleAnimationDirection;
  fill?: DataType.SingleAnimationFillMode;
}

export type Transition = [
  property: keyof CSSProperties | ReadonlyArray<keyof CSSProperties>,
  preset: TransitionPreset,
];

export type TransitionPreset = keyof typeof transitionPresetValues;

const cssTransitions = Object.fromEntries(
  Object.entries(tokens.transitions).map(([name, { duration, easing }]) => [
    name,
    `${duration} ${easing}`,
  ]),
) as {
  [Name in keyof tokens.Transitions]: string;
};

const transitionPresetValues = flattened(cssTransitions);

export const transitionPresets = Object.keys(
  transitionPresetValues,
) as Array<TransitionPreset>;
