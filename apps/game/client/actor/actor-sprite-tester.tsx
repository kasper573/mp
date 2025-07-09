import { createEffect, createSignal, Show } from "solid-js";
import { Application, Container, Text } from "pixi.js";
import {
  cardinalDirectionAngles,
  nearestCardinalDirection,
  Vector,
} from "@mp/math";
import { Select } from "@mp/ui";
import type { CSSProperties } from "@mp/style";

import {
  actorAnimationNames,
  type ActorModelId,
  type ActorAnimationName,
} from "../../server/traits/appearance";
import { ioc } from "../context";
import { ctxGameRpcClient } from "../game-rpc-client";
import { ctxEngine } from "../engine-context";
import { SolidPixi } from "../pixi/solid-pixi";
import { Effect } from "../effect";
import { ActorSprite } from "./actor-sprite";
import {
  ctxActorSpritesheetLookup,
  loadActorSpritesheets,
} from "./actor-spritesheet-lookup";

export function ActorSpriteTester() {
  const rpc = ioc.get(ctxGameRpcClient);
  const spritesheets = rpc.area.actorSpritesheetUrls.useQuery(() => ({
    input: void 0,
    map: loadActorSpritesheets,
  }));
  const [animationName, setAnimationName] =
    createSignal<ActorAnimationName>("walk-normal");
  const [modelId, setModelId] = createSignal<ActorModelId>();

  createEffect(() => {
    const firstModelId = spritesheets.data
      ? Array.from(spritesheets.data.keys())[0]
      : undefined;
    if (modelId() === undefined && firstModelId) {
      setModelId(firstModelId);
    }
  });

  return (
    <Show when={spritesheets.data} keyed>
      {(allSpritesheets) => (
        <Effect
          effect={() =>
            ioc.register(ctxActorSpritesheetLookup, allSpritesheets)
          }
        >
          <Show when={modelId()}>
            {(id) => <PixiApp animationName={animationName()} modelId={id()} />}
          </Show>
          <div style={styles.settingsForm}>
            <Select
              value={animationName()}
              onChange={setAnimationName}
              options={actorAnimationNames}
            />
            <Select
              value={modelId()}
              onChange={setModelId}
              options={allSpritesheets.keys().toArray()}
            />
          </div>
        </Effect>
      )}
    </Show>
  );
}

function PixiApp(props: ActorTestSettings) {
  async function createApp() {
    const app = new Application();
    await app.init({
      antialias: true,
      eventMode: "none",
      roundPixels: true,
    });
    app.stage.addChild(new ActorSpriteList(() => props));
    return app;
  }
  return <SolidPixi createApp={createApp} />;
}

const styles = {
  settingsForm: {
    position: "absolute",
    top: "80px",
    right: "16px",
    background: "black",
    color: "white",
  },
} satisfies Record<string, CSSProperties>;

class ActorSpriteList extends Container {
  constructor(options: () => ActorTestSettings) {
    super();

    // eslint-disable-next-line unicorn/no-array-for-each
    Object.entries(cardinalDirectionAngles).forEach(([name, angle], index) => {
      this.addChild(
        new SpecificActorAngle(() => ({
          ...options(),
          angle: angle,
          name: name,
          pos: new Vector(0, index * 64),
        })),
      );
    });

    this.addChild(new LookAtPointerActor(options));
  }
}

interface ActorTestSettings {
  modelId: ActorModelId;
  animationName: ActorAnimationName;
}

class SpecificActorAngle extends Container {
  private sprite: ActorSprite;
  private text: Text;
  private frameNumberText: Text;

  constructor(
    private options: () => ActorTestSettings & {
      showFrameNumber?: boolean;
      angle: number;
      name?: string;
      pos: Vector<number>;
      anchor?: Vector<number>;
    },
  ) {
    super();

    this.sprite = new ActorSprite();

    this.text = new Text({ style: { fill: "white", fontSize: "14px" } });
    this.text.scale.set(0.5);
    this.frameNumberText = new Text({
      style: { fill: "white", fontSize: "14px" },
    });
    this.frameNumberText.scale.set(0.5);
    this.frameNumberText.position.set(-10, 16);

    this.addChild(this.sprite);
    this.addChild(this.text);
    this.addChild(this.frameNumberText);
    this.scale.set(2);

    this.onRender = this.#onRender;
  }

  #onRender = () => {
    const {
      modelId,
      angle,
      name,
      pos,
      anchor,
      showFrameNumber,
      animationName,
    } = this.options();

    const spritesheets = ioc
      .access(ctxActorSpritesheetLookup)
      .unwrapOr(undefined)
      ?.get(modelId);

    if (spritesheets) {
      this.sprite.spritesheets = spritesheets;
    }
    this.sprite.direction = nearestCardinalDirection(angle);
    this.sprite.switchAnimationSmoothly(animationName);

    if (name) {
      this.text.text = `${name} (${angle.toFixed(2)})`;
      this.text.visible = true;
    } else {
      this.text.visible = false;
    }
    this.text.position.set(64, 32);
    this.position.set(pos.x, pos.y);
    this.frameNumberText.visible = showFrameNumber ?? false;
    this.sprite.anchor.set(anchor?.x ?? 0, anchor?.y ?? 0);
  };
}

class LookAtPointerActor extends SpecificActorAngle {
  constructor(options: () => ActorTestSettings) {
    super(() => {
      const engine = ioc.access(ctxEngine).unwrapOr(undefined);
      const { x, y } = engine ? engine.camera.cameraSize.get() : Vector.zero();
      const center = new Vector(x / 2, y / 2);
      const angle = engine ? center.angle(engine.pointer.position.get()) : 0;
      return {
        ...options(),
        angle,
        pos: center,
        anchor: new Vector(0.5, 0.5),
        showFrameNumber: true,
        animationName: options().animationName,
      };
    });
  }
}
