import type { Entity, PlayerState } from "@mp/server";
import uniqolor from "uniqolor";
import { v2 } from "@mp/data";
import { api } from "./api";

const canvas = document.querySelector("canvas")!;
let state: PlayerState | undefined;
renderNextFrame();

api.player.state.subscribe(renderWorld);
window.addEventListener("resize", resizeCanvas);

resizeCanvas();

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

canvas.addEventListener("click", (e) => {
  const { clientX, clientY } = e;
  const x = clientX / canvas.width;
  const y = clientY / canvas.height;
  api.player.move(v2(x, y));
});

function renderNextFrame() {
  requestAnimationFrame(() => {
    if (state) {
      renderWorld(state);
    }
    renderNextFrame();
  });
}

function renderWorld({ currentScene }: PlayerState) {
  const ctx = canvas.getContext("2d")!;
  ctx.reset();
  for (const entity of currentScene.entities.values()) {
    drawEntity(ctx, entity);
  }
}

function drawEntity(ctx: CanvasRenderingContext2D, entity: Entity) {
  const { position, targetPosition } = entity;
  const x = position.x * canvas.width;
  const y = position.y * canvas.height;

  ctx.fillStyle = uniqolor(entity.id).color;
  ctx.fillRect(x, y, 10, 10);

  const x2 = targetPosition.x * canvas.width;
  const y2 = targetPosition.y * canvas.height;
  ctx.fillRect(x2, y2, 2, 2);
}
