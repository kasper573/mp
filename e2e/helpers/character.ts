import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";

export interface Start {
  area: string;
  x: number;
  y: number;
}

// Joins the game as a test_character row instead of a fresh character: the row is posted with the
// session's own bearer token the moment the client asks for its session, so the server builds the
// character before the socket opens. Call it before signing in; it applies to the first session only.
export async function playAs(page: Page, character: string, start?: Start): Promise<void> {
  await page.route(
    "**/session",
    async (route) => {
      const request = route.request();
      const origin = new URL(request.url()).origin;
      const posted = await page.request.post(`${origin}/test/character`, {
        headers: { Authorization: request.headers()["authorization"] ?? "" },
        data: { test_character: character, start },
      });
      if (!posted.ok()) {
        throw new Error(`playing as ${character} was refused: HTTP ${posted.status()} ${await posted.text()}`);
      }
      await route.continue();
    },
    { times: 1 },
  );
}

export function residentSpot(area: string, npc: string): Start {
  const row = JSON.parse(readFileSync(join(__dirname, "..", "..", "content", "tables", "area", `${area}.json`), "utf8"));
  const resident = row.modules.find((module: { type: string; npc?: string }) => module.type === "resident" && module.npc === npc);
  if (!resident) throw new Error(`no ${npc} lives in ${area}`);
  return { area, x: resident.at.x, y: resident.at.y };
}
