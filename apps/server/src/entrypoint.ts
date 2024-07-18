import { createServer } from "./definition";
import { env } from "./env";

createServer().listen(env.port);
console.log(`Server listening on port ${env.port}`);
