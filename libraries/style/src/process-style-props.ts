import type { RuntimeFn } from "@vanilla-extract/recipes";
import { clsx } from "clsx";

export type StyledComponentProps<Recipe> =
  Recipe extends RuntimeFn<infer _> ? Parameters<Recipe>[0] : {};

export function processStyleProps<Props>(
  props: Props,
  classOrRecipe: string | string[] | AnyRecipe,
): Props {
  let spreadProps: AnyProps;
  let additionalClasses: string[];
  if (Array.isArray(classOrRecipe)) {
    spreadProps = props as AnyProps;
    additionalClasses = classOrRecipe;
  } else if (typeof classOrRecipe === "string") {
    spreadProps = props as AnyProps;
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
    className: clsx(
      Reflect.get(spreadProps, "className") as string | undefined,
      ...additionalClasses,
    ),
  } as Props;
}

type AnyProps = Record<string, unknown>;

// oxlint-disable-next-line no-explicit-any
type AnyRecipe = RuntimeFn<any>;
