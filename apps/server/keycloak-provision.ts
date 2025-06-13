import { KeycloakAdminClient } from "@mp/keycloak-provision";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import { assert } from "@mp/std";
import { groupedRoles, playerGroup } from "./src/roles";

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

function log(...args: unknown[]) {
  logger.info("[keycloak provision]", ...args);
}

const realm = "mp";
const client = new KeycloakAdminClient({
  baseUrl: process.env.KC_PUBLIC_BASE_URL as string,
});

async function authenticateWithKeycloak() {
  const baseUrl = process.env.KC_PUBLIC_BASE_URL as string;
  log("Authenticating with Keycloak at", baseUrl);

  // Try service account authentication first
  const clientSecret = process.env.KC_PROVISIONING_CLIENT_SECRET;
  if (clientSecret) {
    try {
      log("Attempting service account authentication...");
      await client.auth({
        grantType: "client_credentials",
        clientId: "provisioning",
        clientSecret,
      });
      log("Successfully authenticated using service account");
      return;
    } catch (error) {
      log("Service account authentication failed:", error);
      log("Falling back to bootstrap admin credentials...");
    }
  } else {
    log("No service account credentials found, using bootstrap admin credentials...");
  }

  // Fall back to bootstrap admin credentials
  const adminUsername = process.env.KC_ADMIN_USERNAME || process.env.KC_BOOTSTRAP_ADMIN_USERNAME;
  const adminPassword = process.env.KC_ADMIN_PASSWORD || process.env.KC_BOOTSTRAP_ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    throw new Error(
      "No authentication credentials available. Please provide either " +
      "KC_PROVISIONING_CLIENT_SECRET or KC_ADMIN_USERNAME/KC_ADMIN_PASSWORD or " +
      "KC_BOOTSTRAP_ADMIN_USERNAME/KC_BOOTSTRAP_ADMIN_PASSWORD"
    );
  }

  await client.auth({
    username: adminUsername,
    password: adminPassword,
    grantType: "password",
    clientId: "admin-cli",
  });
  log("Successfully authenticated using admin credentials");
}

await authenticateWithKeycloak();

// Ensure the provisioning service account has the necessary permissions
await ensureServiceAccountPermissions();

await upsertRolesAndGroups(groupedRoles);

log("Setting default group to", playerGroup);
await client.realms.update({ realm }, { defaultGroups: [playerGroup] });

async function ensureServiceAccountPermissions() {
  try {
    // Check if we have a provisioning service account that needs permissions
    const clients = await client.clients.find({ realm, clientId: "provisioning" });
    const provisioningClient = clients.find(c => c.clientId === "provisioning");
    
    if (!provisioningClient) {
      log("No provisioning service account found, skipping permission setup");
      return;
    }

    log("Ensuring provisioning service account has realm management permissions");

    // Get the realm-management client
    const realmManagementClients = await client.clients.find({ realm, clientId: "realm-management" });
    const realmManagementClient = realmManagementClients.find(c => c.clientId === "realm-management");
    
    if (!realmManagementClient) {
      log("Warning: realm-management client not found, cannot assign permissions");
      return;
    }

    // Get the service account user for the provisioning client
    const serviceAccountUser = await client.clients.getServiceAccountUser({
      realm,
      id: assert(provisioningClient.id),
    });

    // Get the realm management roles we need
    const clientRoles = await client.clients.listRoles({
      realm,
      id: assert(realmManagementClient.id),
    });

    const requiredRoles = new Set([
      "realm-admin", // Full realm admin access
      "manage-realm",
      "manage-users", 
      "manage-clients",
      "manage-roles",
      "view-realm",
      "view-users",
      "view-clients",
      "view-roles"
    ]);

    const rolesToAssign = clientRoles.filter(role => 
      requiredRoles.has(assert(role.name))
    );

    if (rolesToAssign.length > 0) {
      log(`Assigning ${rolesToAssign.length} realm management roles to provisioning service account`);
      await client.users.addClientRoleMappings({
        realm,
        id: assert(serviceAccountUser.id),
        clientUniqueId: assert(realmManagementClient.id),
        roles: rolesToAssign.map(role => ({
          id: assert(role.id),
          name: assert(role.name),
        })),
      });
      log("Successfully assigned realm management permissions");
    } else {
      log("No matching realm management roles found to assign");
    }
  } catch (error) {
    log("Warning: Failed to set up service account permissions:", error);
    // Don't throw - this is not critical for basic functionality
  }
}

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
