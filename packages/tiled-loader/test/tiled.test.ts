import fs from "fs/promises";
import path from "path";
import { expect, it } from "vitest";
import type { CreateTiledLoaderOptions } from "../src/loader";
import { createTiledLoader } from "../src/loader";

const loadJson = (p: string) => fs.readFile(p, "utf-8").then(JSON.parse);

const loaderOptions: CreateTiledLoaderOptions = {
  loadJson,
  relativePath: (p, b) => path.resolve(path.dirname(b), p),
};

const tmjPath = path.resolve(__dirname, "./fixtures/map.tmj");

it("can parse without error", async () => {
  const load = createTiledLoader(loaderOptions);
  const result = await load(tmjPath);
  expect(result.error).toBe(undefined);
});
