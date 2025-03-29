import { KeycloakAdminClient } from "@mp/keycloak-provision";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import { groupedRoles, playerGroup } from "./src/roles";

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

logger.info("Provisioning!");

const realm = "mp";
const client = new KeycloakAdminClient({
  baseUrl: process.env.KC_HOSTNAME as string,
});

logger.info("Authenticating with Keycloak");
await client.auth({
  username: process.env.KC_ADMIN_USERNAME,
  password: process.env.KC_ADMIN_PASSWORD,
  grantType: "password",
  clientId: "admin-cli",
});

logger.info("Setting default group to", playerGroup);
await client.realms.update({ realm }, { defaultGroups: [playerGroup] });

await upsertRolesAndGroups(groupedRoles);

async function upsertRolesAndGroups(groupedRoles: Record<string, string[]>) {
  const allNewRoles = new Set(Object.values(groupedRoles).flat());

  let existingRoles = await client.roles.find({ realm });
  for (const roleName of allNewRoles) {
    const exists = existingRoles.find((r) => r.name === roleName);
    if (!exists) {
      logger.info("Creating new role", roleName);
      await client.roles.create({ realm, name: roleName });
    }
  }

  existingRoles = await client.roles.find({ realm });
  const existingGroups = await client.groups.find({ realm });

  for (const groupName of Object.keys(groupedRoles)) {
    let group = existingGroups.find((g) => g.name === groupName);
    const roleNames = groupedRoles[groupName];
    if (!group) {
      logger.info("Creating new group", groupName);
      group = await client.groups.create({ realm, name: groupName });
    }

    const roles = existingRoles.filter((r) => roleNames.includes(r.name!));
    logger.info(
      `Adding roles to group "${groupName}":`,
      roles.map((r) => r.name),
    );
    await client.groups.addRealmRoleMappings({
      realm,
      id: group.id!,
      roles: roles.map((role) => ({
        id: role.id!,
        name: role.name!,
      })),
    });
  }
}
