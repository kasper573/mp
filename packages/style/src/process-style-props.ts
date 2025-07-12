import type { RuntimeFn } from "@vanilla-extract/recipes";
import clsx from "clsx";

export type StyledComponentProps<Recipe> =
  Recipe extends RuntimeFn<infer _> ? Parameters<Recipe>[0] : {};

export function processStyleProps<Props extends { className?: unknown }>(
  props: Props,
  classOrRecipe: string | string[] | AnyRecipe,
): Props {
  let spreadProps: AnyProps;
  let additionalClasses: string[];
  if (Array.isArray(classOrRecipe)) {
    spreadProps = props;
    additionalClasses = classOrRecipe;
  } else if (typeof classOrRecipe === "string") {
    spreadProps = props;
    additionalClasses = [classOrRecipe];
  } else {
    const recipeProps: AnyProps = {};
    spreadProps = {};
    const variants = classOrRecipe.variants() as Array<keyof Props>;
    for (const key in props) {
      if (variants.includes(key)) {
        recipeProps[key] = props[key];
      } else {
        spreadProps[key] = props[key];
      }
    }
    additionalClasses = [classOrRecipe(recipeProps as never)];
  }
  return {
    ...spreadProps,
    className: clsx(props.className as never, ...additionalClasses),
  } as Props;
}

type AnyProps = Record<string, unknown>;

type AnyRecipe = RuntimeFn<any>;
