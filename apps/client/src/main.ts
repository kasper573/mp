import type { Entity, PlayerState } from "@mp/server";
import { api } from "./api";

const entities = new Map<Entity["id"], EntityView>();

api.player.state.subscribe(renderPlayerState);

document.addEventListener("mousemove", (e) => {
  const { clientX, clientY } = e;
  const x = clientX / window.innerWidth;
  const y = clientY / window.innerHeight;
  api.player.move({ x, y });
});

function renderPlayerState(scene: PlayerState) {
  const remainingEntityIds = new Set(entities.keys());
  for (const entityState of scene.currentScene.entities.values()) {
    remainingEntityIds.delete(entityState.id);
    let entity = entities.get(entityState.id);
    if (!entity) {
      entity = new EntityView(entityState);
      document.body.appendChild(entity.element);
      entities.set(entityState.id, entity);
    } else {
      entity.update(entityState);
    }
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
