import { spectatorViewRole } from "../shared/spectator-roles";
import { defineRoles } from "./user/define-roles";

export const spectatorRoles = defineRoles("spectator", ["view"]);

// Ensure the shared constant matches the defined role
if (spectatorRoles.view !== spectatorViewRole) {
  throw new Error(
    "Spectator role mismatch between shared and server definitions",
  );
}
