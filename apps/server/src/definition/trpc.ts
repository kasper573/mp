import { initTRPC } from "@trpc/server";
import transformer from "superjson";
import type { ServerContext } from "./context";

export const t = initTRPC.context<ServerContext>().create({ transformer });
