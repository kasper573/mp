import config from "@colyseus/tools";
import { AreaModule } from "./modules/area/room";
import { ModuleName } from "./modules";

export default config({
  initializeGameServer(server) {
    server.define(ModuleName.area, AreaModule);
  },
});
