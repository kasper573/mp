import config from "@colyseus/tools";
import { AreaRoom } from "./modules/area/room";
import { ModuleName } from "./modules/names";

export default config({
  initializeGameServer(server) {
    server.define(ModuleName.area, AreaRoom);
  },
});
