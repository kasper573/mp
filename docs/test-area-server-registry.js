#!/usr/bin/env node

// Simple test script to verify area server registration
import { createDbClient } from "./apps/server/src/db/client.js";
import { AreaServerRegistry } from "./apps/server/src/services/area-server-registry.js";

const DATABASE_URL =
  process.env.MP_SERVER_DATABASE_URL ||
  "postgres://mp:mp@localhost:5432/mp_game";

async function testAreaServerRegistry() {
  console.log("Testing area server registry...");

  try {
    const db = createDbClient(DATABASE_URL);
    const registry = new AreaServerRegistry(db);

    // Test registration
    await registry.register("test-server", {
      areas: ["test-area"],
      endpoint: "ws://localhost:3000/ws",
      healthCheck: "http://localhost:3000/health",
    });

    console.log("✓ Server registered successfully");

    // Test discovery
    const serverInfo = await registry.getServerForArea("test-area");
    if (serverInfo) {
      console.log("✓ Server discovery successful:", serverInfo);
    } else {
      console.log("✗ Server discovery failed");
    }

    // Test listing all servers
    const allServers = await registry.getAllServers();
    console.log("✓ All servers:", allServers);

    // Cleanup
    await registry.unregister("test-server");
    console.log("✓ Server unregistered successfully");
  } catch (error) {
    console.error("✗ Test failed:", error);
    process.exit(1);
  }
}

testAreaServerRegistry()
  .then(() => {
    console.log("All tests passed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
