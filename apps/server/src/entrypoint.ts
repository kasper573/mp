import "./polyfill";
import { listen } from "@colyseus/tools";
import config from "./app.config";
import { env } from "./env";

listen(config, env.wsPort);
