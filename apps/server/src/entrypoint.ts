import { createServer } from "./server";
import { env } from "./env";

const server = createServer();
server.listen(env.port);

setInterval(() => server.tick({ time: new Date() }), env.tickInterval);
