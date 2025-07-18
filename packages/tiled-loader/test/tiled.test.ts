import fs from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { createVectorTiledLoader } from "../src/vector-loader";

const loadFile = (p: string) => fs.readFile(p, "utf8").then(JSON.parse);

const tmjPath = path.resolve(__dirname, "./fixtures/map.json");

it("can parse without error", async () => {
  const loader = createVectorTiledLoader({ loadFile });
  const result = await loader.load(tmjPath);
  expect(result.isErr()).toBe(false);
});
