import { useEffect, useState } from "preact/hooks";
import { Container, Text } from "@mp/graphics";
import {
  cardinalDirectionAngles,
  nearestCardinalDirection,
  Vector,
} from "@mp/math";
import { Select } from "@mp/ui";

import { Engine } from "@mp/engine";
import { useGraphics } from "@mp/graphics/react";
import { assert } from "@mp/std";
import type { CSSProperties } from "@mp/style";
import { useSignal } from "@mp/state/react";
import {
  actorAnimationNames,
  type ActorModelId,
  type ActorAnimationName,
} from "../../server/traits/appearance";
import { ioc } from "../context/ioc";
import { ctxGameRpcClient } from "../game-rpc-client";
import { ctxEngine } from "../context/common";
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

  const animationName = useSignal<ActorAnimationName>("walk-normal");
  const modelId = useSignal<ActorModelId>(allModelIds[0]);

  useEffect(
    () => ioc.register(ctxActorSpritesheetLookup, spritesheets),
    [spritesheets],
  );

  return (
    <>
      <div id="form" style={styles.settingsForm}>
        <Select signal={animationName} options={actorAnimationNames} />
        <Select signal={modelId} options={allModelIds} />
      </div>
      {modelId.value ? (
        <PixiApp
          settings={() => ({
            animationName: animationName.value,
            modelId: modelId.value,
          })}
        />
      ) : null}
    </>
  );
}

function PixiApp({ settings }: { settings: () => ActorTestSettings }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useGraphics(
    container,
    {
      antialias: true,
      eventMode: "none",
      roundPixels: true,
    },
    (app) => {
      const engine = new Engine(assert(container));
      const subs = [engine.start(true), ioc.register(ctxEngine, engine)];
      app.stage.addChild(new ActorSpriteList(settings));
      return subs;
    },
  );

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
  constructor(options: () => ActorTestSettings) {
    super();

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
      const { x, y } = engine.camera.cameraSize.value;
      const center = new Vector(x / 2, y / 2);
      const angle = center.angle(engine.pointer.position.value);
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
