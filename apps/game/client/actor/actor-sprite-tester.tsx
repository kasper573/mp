import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Container, Text } from "@mp/graphics";
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
import { ActorSprite } from "./actor-sprite";
import {
  ctxActorSpritesheetLookup,
  loadActorSpritesheets,
} from "./actor-spritesheet-lookup";

export function ActorSpriteTester() {
  const rpc = ioc.get(ctxGameRpcClient);
  const { data: spritesheets } = rpc.area.actorSpritesheetUrls.useSuspenseQuery(
    {
      input: void 0,
      map: loadActorSpritesheets,
    },
  );

  const allModelIds = Array.from(spritesheets.keys());

  const [animationName, setAnimationName] =
    useState<ActorAnimationName>("walk-normal");
  const [modelId, setModelId] = useState<ActorModelId>(allModelIds[0]);

  useEffect(() => ioc.register(ctxActorSpritesheetLookup, spritesheets));

  return (
    <>
      <div id="form" style={styles.settingsForm}>
        <Select
          value={animationName}
          onChange={setAnimationName}
          options={actorAnimationNames}
          required
        />
        <Select
          value={modelId}
          onChange={setModelId}
          options={allModelIds}
          required
        />
      </div>
      {modelId ? (
        <PixiApp animationName={animationName} modelId={modelId} />
      ) : null}
    </>
  );
}

function PixiApp(props: ActorTestSettings) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [resizeTo, setResizeTo] = useState<HTMLDivElement | null>(null);

  useGraphics(
    {
      canvas,
      resizeTo,
      antialias: true,
      eventMode: "none",
      roundPixels: true,
    },
    (app) => {
      app.stage.addChild(new ActorSpriteList(() => props));
      const engine = new Engine(app.canvas);
      return [engine.start(true), ioc.register(ctxEngine, engine)];
    },
  );

  return (
    <div style={{ flex: 1 }} ref={setResizeTo}>
      <canvas ref={setCanvas} />
    </div>
  );
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
