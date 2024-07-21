import { createServer } from "./server";
import { env } from "./env";

const server = createServer();
server.listen(env.port);

const currentSecond = () => Date.now() / 1000;

let last = currentSecond();
setInterval(() => {
  const now = currentSecond();
  const deltaTime = now - last;
  last = now;
  server.tick({ deltaTime });
}, env.tickInterval);
