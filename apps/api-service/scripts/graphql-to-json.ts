import fs from "fs/promises";
import { buildSchema, introspectionFromSchema } from "graphql";

const [graphqlFile, jsonFile] = process.argv.slice(2);
const graphql = await fs.readFile(graphqlFile, "utf-8");
const schema = buildSchema(graphql);
const json = introspectionFromSchema(schema);
await fs.writeFile(jsonFile, JSON.stringify(json, null, 2), "utf-8");
