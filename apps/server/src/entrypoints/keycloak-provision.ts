// oxlint-disable no-await-in-loop
import { KeycloakAdminClient } from "@mp/keycloak-provision";
import { createConsoleLogger } from "@mp/logger";
import { assert } from "@mp/std";
import { groupedRoles, playerGroup } from "../roles";

const logger = createConsoleLogger();

function log(...args: unknown[]) {
  logger.info("[keycloak provision]", ...args);
}

const realm = "mp";
const client = new KeycloakAdminClient({
  baseUrl: process.env.KC_PUBLIC_BASE_URL as string,
});

log("Authenticating with Keycloak at", process.env.KC_PUBLIC_BASE_URL);
await client.auth({
  username: process.env.KC_ADMIN_USERNAME,
  password: process.env.KC_ADMIN_PASSWORD,
  grantType: "password",
  clientId: "admin-cli",
});

await upsertRolesAndGroups(groupedRoles);

log("Setting default group to", playerGroup);
await client.realms.update({ realm }, { defaultGroups: [playerGroup] });

async function upsertRolesAndGroups(groupedRoles: Record<string, string[]>) {
  const allNewRoles = new Set(Object.values(groupedRoles).flat());

  let existingRoles = await client.roles.find({ realm });
  for (const roleName of allNewRoles) {
    const exists = existingRoles.find((r) => r.name === roleName);
    if (!exists) {
      log("Creating new role", roleName);
      await client.roles.create({ realm, name: roleName });
    }
  }

  existingRoles = await client.roles.find({ realm });
  const existingGroups = await client.groups.find({ realm });

  for (const groupName of Object.keys(groupedRoles)) {
    let group = existingGroups.find((g) => g.name === groupName);
    const roleNames = groupedRoles[groupName];
    if (!group) {
      log("Creating new group", groupName);
      group = await client.groups.create({ realm, name: groupName });
    }

    const roles = existingRoles.filter((r) =>
      roleNames.includes(assert(r.name)),
    );
    log(
      `Adding roles to group "${groupName}":`,
      roles.map((r) => r.name),
    );
    await client.groups.addRealmRoleMappings({
      realm,
      id: assert(group.id),
      roles: roles.map((role) => ({
        id: assert(role.id),
        name: assert(role.name),
      })),
    });
  }
}
