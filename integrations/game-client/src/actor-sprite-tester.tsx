import type { ActorModelId } from "@mp/db/types";
import { Engine } from "@mp/engine";
import { actorModelStates, type ActorModelState } from "@mp/game-shared";
import { Container, Text } from "@mp/graphics";
import { useGraphics } from "@mp/graphics/react";
import {
  cardinalDirectionAngles,
  nearestCardinalDirection,
  Vector,
} from "@mp/math";
import type { Signal } from "@mp/state";
import { useSignal, useSignalEffect } from "@mp/state/react";
import type { CSSProperties } from "@mp/style";
import { Select } from "@mp/ui";
import { useState } from "preact/hooks";
import { ActorSprite } from "./actor-sprite";
import type { ActorTextureLookup } from "./actor-texture-lookup";
import { useObjectSignal } from "./use-object-signal";

export function ActorSpriteTester({
  modelIds,
  actorTextures,
}: {
  modelIds: ActorModelId[];
  actorTextures: ActorTextureLookup;
}) {
  const animationName = useSignal<ActorModelState>("walk-normal");
  const modelId = useSignal<ActorModelId>(modelIds[0]);

  const settings = useObjectSignal({
    animationName: animationName.value,
    modelId: modelId.value,
    actorTextures,
  });

  return (
    <>
      <div id="form" style={styles.settingsForm}>
        <Select signal={animationName} options={actorModelStates} />
        <Select signal={modelId} options={modelIds} />
      </div>
      {modelId.value ? <PixiApp settings={settings} /> : null}
    </>
  );
}

function PixiApp({
  settings,
}: {
  settings: Signal<Omit<ActorTestSettings, "engine">>;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const appSignal = useGraphics(container);

  useSignalEffect(() => {
    const app = appSignal.value;
    if (!app) {
      return;
    }

    const engine = new Engine(app.canvas);
    engine.start(true);
    app.stage.addChild(
      new ActorSpriteList({
        ...settings.value,
        engine,
      }),
    );

    return function cleanup() {
      engine.stop();
      app.stage.removeChildren();
    };
  });

  return <div style={{ flex: 1 }} ref={setContainer} />;
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
  },
  settingsForm: {
    display: "flex",
    justifyContent: "flex-end",
    paddingBottom: "20px",
  },
} satisfies Record<string, CSSProperties>;

class ActorSpriteList extends Container {
  constructor(options: ActorTestSettings) {
    super();

    Object.entries(cardinalDirectionAngles).forEach(([name, angle], index) => {
      this.addChild(
        new SpecificActorAngle(() => ({
          ...options,
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
  animationName: ActorModelState;
  actorTextures: ActorTextureLookup;
  engine: Engine;
}

class SpecificActorAngle extends Container {
  private sprite: ActorSprite;
  private text: Text;

  constructor(
    private options: () => ActorTestSettings & {
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

    this.addChild(this.sprite);
    this.addChild(this.text);
    this.scale.set(2);

    this.onRender = this.#onRender;
  }

  #onRender = () => {
    const { modelId, angle, name, pos, anchor, animationName, actorTextures } =
      this.options();

    this.sprite.textureLookup = (animationName, direction) =>
      actorTextures(modelId, animationName, direction);
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
    this.sprite.anchor.set(anchor?.x ?? 0, anchor?.y ?? 0);
  };
}

class LookAtPointerActor extends SpecificActorAngle {
  constructor(options: ActorTestSettings) {
    super(() => {
      const { x, y } = options.engine.camera.cameraSize.value;
      const center = new Vector(x / 2, y / 2);
      const angle = center.angle(options.engine.pointer.position.value);
      return {
        ...options,
        angle,
        pos: center,
        anchor: new Vector(0.5, 0.5),
        animationName: options.animationName,
      };
    });
  }
}
