import type { RuntimeFn } from "npm:@vanilla-extract/recipes";
import clsx from "npm:clsx";
import { splitProps } from "npm:solid-js";

export type StyledComponentProps<Recipe> = Recipe extends RuntimeFn<infer _>
  ? Parameters<Recipe>[0]
  // deno-lint-ignore ban-types
  : {};

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
