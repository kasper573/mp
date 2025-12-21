import { systemRoles } from "@mp/keycloak";
import { ApiContext, ctxGameServiceConfig } from "../context";
import { roles } from "../integrations/auth";
import { opt } from "../options";

/** @gqlQueryField */
export async function isPatchOptimizerEnabled(
  ctx: ApiContext,
): Promise<boolean> {
  await roles(ctx, [systemRoles.changeSettings]);
  return ctx.ioc.get(ctxGameServiceConfig).value.isPatchOptimizerEnabled;
}

/** @gqlMutationField */
export async function setPatchOptimizerEnabled(
  newValue: boolean,
  ctx: ApiContext,
): Promise<boolean> {
  await roles(ctx, [systemRoles.changeSettings]);
  const config = ctx.ioc.get(ctxGameServiceConfig);
  config.value = {
    ...config.value,
    isPatchOptimizerEnabled: newValue,
  };
  return true;
}

/** @gqlQueryField */
export async function serverVersion(ctx: ApiContext): Promise<string> {
  return opt.version;
}

/** @gqlQueryField */
export async function testError(ctx: ApiContext): Promise<boolean> {
  await roles(ctx, [systemRoles.useDevTools]);
  throw new Error("This is a test error for Dev Tools.");
}
