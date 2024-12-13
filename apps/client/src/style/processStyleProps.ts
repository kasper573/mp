import type { RuntimeFn } from "@vanilla-extract/recipes";
import clsx from "clsx";
import { splitProps } from "solid-js";

export type StyledComponentProps<Recipe> =
  // deno-lint-ignore ban-types
  Recipe extends RuntimeFn<infer _> ? Parameters<Recipe>[0] : {};

export function processStyleProps<Props extends { class?: string }>(
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
    const [recipeProps, otherProps] = splitProps(
      props,
      classOrRecipe.variants() as Array<keyof Props>,
    );
    // eslint-disable-next-line solid/reactivity
    spreadProps = otherProps;
    additionalClasses = [classOrRecipe(recipeProps as never)];
  }
  return {
    ...spreadProps,
    class: clsx(props.class, ...additionalClasses),
  } as Props;
}

type AnyProps = Record<string, unknown>;

// deno-lint-ignore no-explicit-any
type AnyRecipe = RuntimeFn<any>;
