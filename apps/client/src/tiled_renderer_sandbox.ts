import type { AreaId } from "@mp/state";
import { TiledRenderer } from "@mp/tiled-renderer";
import { createTiledLoader } from "@mp/tiled-loader";
import { Application } from "@mp/pixi";
import { api } from "./api";

async function main() {
  const loadTiled = createTiledLoader({
    readBase64: (str: string) =>
      Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
    loadMap: fetchJson,
    loadTileset: fetchJson,
  });

  const rootElement = document.querySelector("div#root")!;
  const areaUrl = await api.modules.area.areaFileUrl("forest" as AreaId);
  const loadTiledResult = await loadTiled(areaUrl);
  if (!loadTiledResult.success) {
    rootElement.textContent = "Failed to load Tiled map";
    return;
  }

  const tiledRenderer = new TiledRenderer(loadTiledResult.output);

  const app = new Application();
  await app.init({ antialias: true, background: 0x005500, resizeTo: window });
  app.stage.addChild(tiledRenderer);
  rootElement.appendChild(app.canvas);
}

main();

async function fetchJson(url: string) {
  const response = await fetch(url);
  return response.json();
}
