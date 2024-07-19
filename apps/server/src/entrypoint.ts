import { createServer } from "./definition";
import { env } from "./env";

createServer().listen(env.port);
