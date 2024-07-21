import type { Entity, PlayerState } from "@mp/server";
import uniqolor from "uniqolor";
import { api } from "./api";

const canvas = document.querySelector("canvas")!;
const canvasContext = canvas.getContext("2d")!;
const entities = new Map<Entity["id"], EntityView>();

api.player.state.subscribe(renderPlayerState);
window.addEventListener("resize", resizeCanvas);

resizeCanvas();

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

canvas.addEventListener("mousemove", (e) => {
  const { clientX, clientY } = e;
  const x = clientX / canvas.width;
  const y = clientY / canvas.height;
  api.player.move({ x, y });
});

document.addEventListener("mousedown", (e) => {
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);
});

function renderPlayerState(scene: PlayerState) {
  const remainingEntityIds = new Set(entities.keys());
  for (const entity of scene.currentScene.entities.values()) {
    const entityColor = uniqolor(entity.id).color;
    remainingEntityIds.delete(entity.id);
    let view = entities.get(entity.id);
    if (!view) {
      view = new EntityView(entity);
      document.body.appendChild(view.element);
      entities.set(entity.id, view);
    } else {
      view.update(entity);
    }

    canvasContext.fillStyle = entityColor;
    canvasContext.fillRect(
      entity.position.x * canvas.width,
      entity.position.y * canvas.height,
      5,
      5,
    );
  }

  for (const id of remainingEntityIds) {
    const entity = entities.get(id);
    if (entity) {
      entity.element.remove();
      entities.delete(id);
    }
  }
}

class EntityView {
  readonly element = document.createElement("div");
  constructor(private state: Entity) {
    this.render();
  }

  update(newState: Entity) {
    this.state = newState;
    this.render();
  }

  private render() {
    const { x, y } = this.state.position;
    Object.assign(this.element.style, {
      position: "absolute",
      width: "5px",
      height: "5px",
      borderRadius: "50%",
      background: "white",
      left: `${x * 100}%`,
      top: `${y * 100}%`,
      transform: `translate(-50%, -50%)`,
    } satisfies Partial<CSSStyleDeclaration>);
  }
}
