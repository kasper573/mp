import { gatewayRoles } from "@mp/keycloak";
import type { ApiContext } from "../context";
import { roles } from "../integrations/auth";
import type { ItemDefinition, ItemReference } from "@mp/world";
import { lookupItemDefinition } from "@mp/world";

/** @gqlQueryField */
export async function itemDefinition(
  ref: ItemReference,
  ctx: ApiContext,
): Promise<ItemDefinition> {
  await roles(ctx, [gatewayRoles.join]);
  return lookupItemDefinition(ref);
}
