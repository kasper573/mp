import type { Entity, World } from "@mp/data";
import uniqolor from "uniqolor";
import { updateWorld, v2 } from "@mp/data";
import { subscribeToState, events } from "./api";

let world: World | undefined;
const canvas = document.querySelector("canvas")!;

subscribeToState((state) => (world = state));

window.addEventListener("resize", resizeCanvas);

renderNextFrame();
resizeCanvas();

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

canvas.addEventListener("click", (e) => {
  const { clientX, clientY } = e;
  const x = clientX / canvas.width;
  const y = clientY / canvas.height;
  events.player.move(v2(x, y));
});

function renderNextFrame() {
  requestAnimationFrame(() => {
    if (world) {
      updateWorld(world, new Date());
      renderWorld(world);
    }
    renderNextFrame();
  });
}

function renderWorld({ entities }: World) {
  const ctx = canvas.getContext("2d")!;
  ctx.reset();
  for (const entity of entities.values()) {
    drawEntity(ctx, entity);
  }
}

function drawEntity(ctx: CanvasRenderingContext2D, entity: Entity) {
  const { position } = entity;
  const x = position.value.x * canvas.width;
  const y = position.value.y * canvas.height;

  ctx.fillStyle = uniqolor(entity.id).color;
  ctx.fillRect(x - 5, y - 5, 10, 10);

  if (position.interpolation) {
    const { targetValue } = position.interpolation;
    const x2 = targetValue.x * canvas.width;
    const y2 = targetValue.y * canvas.height;
    ctx.fillRect(x2 - 1, y2 - 1, 2, 2);
  }
}
