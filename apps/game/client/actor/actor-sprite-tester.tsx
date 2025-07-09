import type { JSX } from "solid-js";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Application, Container, Text } from "@mp/graphics";
import {
  cardinalDirectionAngles,
  nearestCardinalDirection,
  Vector,
} from "@mp/math";
import { Select } from "@mp/ui";

import { Engine } from "@mp/engine";
import {
  actorAnimationNames,
  type ActorModelId,
  type ActorAnimationName,
} from "../../server/traits/appearance";
import { ioc } from "../context/ioc";
import { ctxGameRpcClient } from "../game-rpc-client";
import { ctxEngine } from "../context/common";
import { useGraphics } from "../use-graphics";
import { Effect } from "../context/effect";
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
          <div id="form" style={styles.settingsForm}>
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
          <Show when={modelId()}>
            {(id) => <PixiApp animationName={animationName()} modelId={id()} />}
          </Show>
        </Effect>
      )}
    </Show>
  );
}

function PixiApp(props: ActorTestSettings) {
  const [getCanvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [getContainer, setContainer] = createSignal<HTMLDivElement>();

  createEffect(() => {
    const canvas = getCanvas();
    const container = getContainer();
    if (!canvas || !container) {
      return;
    }

    useGraphics(
      async () => {
        const app = new Application();
        const engine = new Engine(canvas);
        onCleanup(engine.start(true));
        onCleanup(ioc.register(ctxEngine, engine));
        app.stage.addChild(new ActorSpriteList(() => props));

        await app.init({
          antialias: true,
          eventMode: "none",
          roundPixels: true,
          canvas,
        });
        return app;
      },
      { resizeTo: container },
    );
  });

  return (
    <div style={{ flex: 1 }} ref={setContainer}>
      <canvas ref={setCanvas} />
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    "flex-direction": "column",
    flex: 1,
  },
  settingsForm: {
    display: "flex",
    "justify-content": "flex-end",
    "padding-bottom": "20px",
  },
} satisfies Record<string, JSX.CSSProperties>;

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
      const engine = ioc.get(ctxEngine);
      const { x, y } = engine.camera.cameraSize.get();
      const center = new Vector(x / 2, y / 2);
      const angle = center.angle(engine.pointer.position.get());
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
