import fs from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import type { CreateTiledLoaderOptions } from "../src/loader.ts";
import { createTiledLoader } from "../src/loader.ts";

const loadJson = (p: string) => fs.readFile(p, "utf8").then(JSON.parse);

const loaderOptions: CreateTiledLoaderOptions = {
  loadJson,
  relativePath: (p, b) => path.resolve(path.dirname(b), p),
};

const tmjPath = path.resolve(__dirname, "./fixtures/map.tmj");

it("can parse without error", async () => {
  const load = createTiledLoader(loaderOptions);
  const result = await load(tmjPath);
  expect(result.isErr()).toBe(false);
});
