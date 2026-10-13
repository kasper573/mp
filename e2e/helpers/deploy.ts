import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
// The copy of content/ the local stack's game server reads.
const STACK_CONTENT = join(ROOT, "target", "stack", "content");

export interface Deploy {
  // What the deploy changed, as the player sees it.
  filesChanged: number;
  // Puts the first version back and restarts the server again, off camera.
  undo(): void;
}

// Changes a few rows of the served content and restarts the game server on them, as a content
// deploy does: the running clients reconnect, sync the changed files and rejoin.
export function deployChanges(edits: Record<string, (row: Record<string, unknown>) => void>): Deploy {
  const before = new Map<string, string>();
  for (const [file, edit] of Object.entries(edits)) {
    const path = join(STACK_CONTENT, file);
    const text = readFileSync(path, "utf8");
    before.set(path, text);
    const row = JSON.parse(text) as Record<string, unknown>;
    edit(row);
    writeFileSync(path, `${JSON.stringify(row, null, 2)}\n`);
  }
  restartServer();
  return {
    filesChanged: before.size,
    undo: () => {
      for (const [path, text] of before) writeFileSync(path, text);
      restartServer();
    },
  };
}

function restartServer(): void {
  execFileSync(
    "docker",
    [
      "compose",
      "-f",
      join(ROOT, "docker", "docker-compose.yaml"),
      "-f",
      join(ROOT, "docker", "docker-compose.test.yaml"),
      "--profile",
      "test",
      "restart",
      "rift-game-server",
    ],
    { cwd: join(ROOT, "docker"), stdio: "ignore" },
  );
}
