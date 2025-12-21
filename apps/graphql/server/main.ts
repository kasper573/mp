import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import createExpressApp, { json } from "express";
import http from "http";
import cors from "cors";
import { getSchema } from "./schema.generated";
import { typesMap } from "../shared/scalars";

const express = createExpressApp();
const httpServer = http.createServer(express);

const apolloServer = new ApolloServer({
  schema: getSchema({ scalars: typesMap }),
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
  allowBatchedHttpRequests: true,
});

await apolloServer.start();

express.use(cors(), json(), expressMiddleware(apolloServer));

await new Promise<void>((resolve) =>
  httpServer.listen({ port: 4000 }, resolve),
);

console.log(`🚀 Server ready at http://localhost:4000`);
