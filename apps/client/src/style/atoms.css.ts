import type { PropertiesHyphen } from "csstype";
import type { Property } from "csstype";
import { createSprinkles, defineProperties } from "@vanilla-extract/sprinkles";
import {
  borders,
  colors,
  flexes,
  fontFaces,
  overflows,
  radius,
  shadows,
  sizes,
  spacing,
  transform,
  typography,
} from "./tokens.ts";
import type { TransitionPreset } from "./animation.ts";
import { cssForTransition, transitionPresets } from "./animation.ts";

/**
 * The generated CSS of this file will be in the same order as the properties and values are defined,
 * so exercise the same care regarding order-of-precedence as you would with regular CSS.
 *
 * Here we transform the design tokens into flat objects (since sprinkles only accept flat objects).
 *
 * We also give them with some additional css specific values per token.
 * We also take care to specify the commonly used "reset values" (like "none" and "initial") last to give them higher specificity.
 */

// Important convention: Only specify the most common properties and values as sprinkles properties.
// For more specific and advanced properties and values you can use the style() function directly.
// This gives us a good balance between convenience and bundle size since bundle size can grow quickly with a large amount of sprinkles.

// Since transitions are so commonly used we make the most common transitions available as sprinkles.
// For more specific and advanced transitions you can use the createTransition function directly in a style() call.
const commonTransitionGroups = {
  transform: [
    "top",
    "left",
    "right",
    "bottom",
    "transform",
    "width",
    "height",
    "max-width",
    "max-height",
    "min-width",
    "min-height",
  ],
  appearance: [
    "color",
    "background-color",
    "border-color",
    "box-shadow",
    "fill",
    "stroke",
    "opacity",
  ],
} satisfies Record<string, Array<keyof PropertiesHyphen>>;

const commonTransitions = Object.fromEntries(
  Object.entries(commonTransitionGroups).flatMap(([group, propertyNames]) => {
    return transitionPresets.map((preset) => [
      `${group}.${preset}`,
      cssForTransition([propertyNames, preset]),
    ]);
  }),
) as {
  [K in keyof typeof commonTransitionGroups as `${K}.${TransitionPreset}`]:
    string;
};

const unconditionalProperties = defineProperties({
  properties: {
    all: ["unset"] as const,
    transition: commonTransitions,

    // Borders
    borderRadius: radius,
    borderTopRightRadius: radius,
    borderBottomRightRadius: radius,
    borderTopLeftRadius: radius,
    borderBottomLeftRadius: radius,
    border: borders,
    borderBottom: borders,
    borderLeft: borders,
    borderRight: borders,
    borderTop: borders,

    // Spacing
    padding: spacing,
    paddingTop: spacing,
    paddingRight: spacing,
    paddingBottom: spacing,
    paddingLeft: spacing,
    marginTop: spacing,
    marginRight: spacing,
    marginBottom: spacing,
    marginLeft: spacing,
    margin: spacing,
    gap: spacing,
    rowGap: spacing,
    columnGap: spacing,

    // Text
    typography,

    // Transform
    inset: sizes,
    left: sizes,
    top: sizes,
    right: sizes,
    bottom: sizes,
    overflowX: overflows,
    overflowY: overflows,
    width: sizes,
    height: sizes,
    minWidth: sizes,
    minHeight: sizes,
    maxWidth: sizes,
    maxHeight: sizes,
    transform,

    // Regular / non-design token css properties
    fontFamily: {
      inherit: "inherit",
      normal: "normal",
      ...fontFaces,
    },
    fontWeight: ["inherit", "normal", "bold"] as const,
    fontStyle: ["inherit", "normal", "italic"] as const,
    fontSize: ["inherit", "100%"] as const,
    lineHeight: ["1em", "inherit", "100%"] as const,
    position: ["static", "relative", "absolute", "fixed", "sticky"] as const,
    userSelect: ["none", "auto"] as const,
    pointerEvents: ["none", "auto", "all"] as const,
    visibility: ["hidden", "visible"] as const,
    cursor: ["pointer", "default"] as const,
    textAlign: ["inherit", "left", "center", "right", "justify"] as const,
    borderCollapse: ["collapse", "separate"] as const,
    textDecoration: ["none", "underline", "line-through"] as const,
    textTransform: ["none", "uppercase", "lowercase", "capitalize"] as const,
    touchAction: ["none", "auto"] as const,
    boxSizing: ["border-box", "content-box"] as const,
    backgroundPosition: ["center", "top", "bottom", "left", "right"] as const,
    backgroundSize: ["cover", "contain"] as const,
    objectFit: ["fill", "contain", "cover", "none", "scale-down"] as const,
    display: [
      "none",
      "block",
      "inline",
      "inline-block",
      "flex",
      "inline-flex",
      "grid",
      "inline-grid",
    ] as const,
    alignItems: [
      "stretch",
      "center",
      "baseline",
      "start",
      "end",
      "flex-start",
      "flex-end",
      "self-end",
      "self-start",
    ] satisfies Array<Property.AlignItems>,
    justifyContent: [
      "stretch",
      "center",
      "baseline",
      "start",
      "end",
      "space-around",
      "space-between",
      "space-evenly",
      "flex-start",
      "flex-end",
      "self-end",
      "self-start",
    ] satisfies Array<Property.JustifyContent>,
    flexWrap: ["nowrap", "wrap", "wrap-reverse"] as const,
    flexDirection: ["row", "row-reverse", "column", "column-reverse"] as const,
    flex: flexes,
    gridAutoFlow: [
      "column",
      "row",
      "dense",
    ] satisfies Array<Property.GridAutoFlow>,
    opacity: [0, 0.25, 0.4, 0.5, 0.6, 0.75, 1] as const,
    textOverflow: ["ellipsis", "clip"] as const,
    whiteSpace: ["normal", "nowrap", "pre", "pre-wrap", "pre-line"] as const,
    aspectRatio: ["none", "1/1", "16/9", "4/3", "21/9"] as const,
    listStyle: ["none", "disc", "circle", "square"] as const,
  },
  shorthands: {
    p: ["padding"],
    m: ["margin"],
    px: ["paddingLeft", "paddingRight"],
    py: ["paddingTop", "paddingBottom"],
    pt: ["paddingTop"],
    pr: ["paddingRight"],
    pb: ["paddingBottom"],
    pl: ["paddingLeft"],
    mx: ["marginLeft", "marginRight"],
    my: ["marginTop", "marginBottom"],
    mt: ["marginTop"],
    mr: ["marginRight"],
    mb: ["marginBottom"],
    ml: ["marginLeft"],
    overflow: ["overflowX", "overflowY"],
    borderRightRadius: ["borderTopRightRadius", "borderBottomRightRadius"],
    borderLeftRadius: ["borderTopLeftRadius", "borderBottomLeftRadius"],
    borderTopRadius: ["borderTopLeftRadius", "borderTopRightRadius"],
    borderBottomRadius: ["borderBottomLeftRadius", "borderBottomRightRadius"],
    borderY: ["borderTop", "borderBottom"],
    borderX: ["borderLeft", "borderRight"],
  },
});

// We define a separate set of properties for values that should support conditions.
// We do this because sprinkles will generate CSS for all permutations, which can lead to a very large bundle if not used sparingly.
const conditionalProperties = defineProperties({
  conditions: {
    default: {},
    hover: { selector: "&:hover" },
    focus: { selector: "&:focus-visible" },
    active: { selector: "&:active" },
  },
  defaultCondition: "default",
  properties: {
    borderColor: colors,
    color: colors,
    backgroundColor: colors,
    outline: ["none", "inherit"] as const,
    textShadow: shadows,
    boxShadow: shadows,
  },
});

export const atoms = createSprinkles(
  unconditionalProperties,
  conditionalProperties,
);
