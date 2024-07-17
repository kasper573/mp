import transformer from "superjson";
import { init } from "@mp/tsock/server";
import type { ServerContext } from "./context";

export const t = init.context<ServerContext>().create({ transformer });
