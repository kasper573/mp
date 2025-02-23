import { KeycloakAdminClient } from "@mp/keycloak-provision";
import { consoleLoggerHandler, Logger } from "@mp/logger";

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

logger.info("Provisioning!");

const realm = "mp";
const client = new KeycloakAdminClient({
  baseUrl: process.env.KC_HOSTNAME as string,
});

await client.auth({
  username: "admin",
  password: "admin",
  grantType: "password",
  clientId: "admin-cli",
});

await upsertGuestUser();

async function upsertGuestUser() {
  const email = "guest@k573.dev";

  try {
    const [user] = await client.users.find({ realm, email });
    logger.info("Deleting", user.id);
    await client.users.del({ realm, id: user.id! });
  } catch {
    // guest user didn't exist, nothing to remove
  }

  // void client.users.create({
  //   realm,
  //   email,
  //   username: "guest",
  //   enabled: true,
  //   firstName: "Guest",
  //   lastName: "User",
  //   credentials: [
  //     {
  //       type: "password",
  //       value: "guest",
  //       temporary: false,
  //     },
  //   ],
  // });
}
