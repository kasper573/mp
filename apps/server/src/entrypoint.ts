import { Server } from "@mp/tsock/server";
import { createRouter } from "./definition/router";
import { createContext } from "./definition/context";
import { env } from "./env";

const server = new Server({
  router: createRouter(),
  createContext,
});

server.listen(env.port);
