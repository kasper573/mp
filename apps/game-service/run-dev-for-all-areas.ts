import type { AreaId } from "@mp/world/server";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Purely a development aid script. Runs `pnpm dev:instance` for all areas in the codebase

const areaIds = await getAreaIds();

await Promise.all(areaIds.map((id, index) => runDevInstance(id, index)));

async function getAreaIds(): Promise<AreaId[]> {
  const areaFiles = await fs.readdir(
    path.resolve(__dirname, "../../docker/file-server/public/areas"),
    { withFileTypes: true },
  );
  return areaFiles
    .filter((entry) => entry.isFile())
    .map(
      (entry) => path.basename(entry.name, path.extname(entry.name)) as AreaId,
    );
}

function runDevInstance(areaId: AreaId, index: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["dev:instance"], {
      env: {
        ...process.env,
        MP_GAME_SERVICE_AREA_ID: areaId,
        MP_GAME_SERVICE_HTTP_PORT: String(9701 + index),
        MP_GAME_SERVICE_DATABASE_PATH: path.resolve(
          __dirname,
          `data/game-${areaId}.sqlite`,
        ),
      },
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm dev:instance exited with code ${code}`));
    });

    child.on("error", reject);
  });
}
