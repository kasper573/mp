import { Application, Pixi } from "@mp/solid-pixi";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  useContext,
} from "solid-js";
import { Container, Text } from "pixi.js";
import {
  cardinalDirectionAngles,
  nearestCardinalDirection,
  Vector,
} from "@mp/math";
import { EngineContext, EngineProvider } from "@mp/engine";
import { Select } from "@mp/ui";

import { assert } from "@mp/std";
import {
  actorAnimationNames,
  type ActorModelId,
  type ActorAnimationName,
} from "../../server/traits/appearance";
import { useRpc } from "../use-rpc";
import { ActorSprite } from "./actor-sprite";
import { ActorSpritesheetContext } from "./actor-spritesheet-lookup";
import { loadActorSpritesheets } from "./actor-spritesheet-lookup";

export function ActorSpriteTester() {
  const rpc = useRpc();
  const spritesheets = rpc.area.actorSpritesheetUrls.useQuery(() => ({
    input: void 0,
    map: loadActorSpritesheets,
  }));
  return (
    <Show when={spritesheets.data} keyed>
      {(spritesheets) => (
        <ActorSpritesheetContext.Provider value={spritesheets}>
          <Application style={{ display: "flex", flex: 1 }}>
            {({ viewport }) => (
              <EngineProvider viewport={viewport}>
                <ActorSpriteList />
              </EngineProvider>
            )}
          </Application>
        </ActorSpritesheetContext.Provider>
      )}
    </Show>
  );
}

function ActorSpriteList() {
  const allModelIds = useContext(ActorSpritesheetContext).keys().toArray();
  const [animationName, setAnimationName] =
    createSignal<ActorAnimationName>("walk-normal");
  const [modelId, setModelId] = createSignal(allModelIds[0]);
  return (
    <>
      <For each={Object.entries(cardinalDirectionAngles)}>
        {([name, angle], index) => (
          <SpecificActorAngle
            modelId={modelId()}
            animationName={animationName()}
            angle={angle}
            name={name}
            pos={new Vector(0, index() * 64)}
          />
        )}
      </For>
      <DynamicActorAngle modelId={modelId()} animationName={animationName()} />
      <div
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          background: "black",
          color: "white",
        }}
      >
        <Select
          value={animationName()}
          onChange={setAnimationName}
          options={actorAnimationNames}
        />
        <Select value={modelId()} onChange={setModelId} options={allModelIds} />
      </div>
    </>
  );
}

function DynamicActorAngle(props: {
  modelId: ActorModelId;
  animationName: ActorAnimationName;
}) {
  const center = useScreenCenter();
  const engine = useContext(EngineContext);
  const angle = createMemo(() => center().angle(engine.pointer.position));
  return (
    <>
      <SpecificActorAngle
        modelId={props.modelId}
        angle={angle()}
        pos={center()}
        anchor={new Vector(0.5, 0.5)}
        showFrameNumber
        animationName={props.animationName}
      />
    </>
  );
}

function useScreenCenter() {
  const engine = useContext(EngineContext);
  const center = createMemo(
    () =>
      new Vector(
        engine.camera.cameraSize.x / 2,
        engine.camera.cameraSize.y / 2,
      ),
  );
  return center;
}

function SpecificActorAngle(props: {
  modelId: ActorModelId;
  angle: number;
  name?: string;
  pos: Vector<number>;
  anchor?: Vector<number>;
  showFrameNumber?: boolean;
  animationName: ActorAnimationName;
}) {
  const allSpritesheets = useContext(ActorSpritesheetContext);
  const sprite = new ActorSprite();
  const container = new Container();
  const text = new Text({ style: { fill: "white", fontSize: "14px" } });
  text.scale.set(0.5);
  const frameNumberText = new Text({
    style: { fill: "white", fontSize: "14px" },
  });
  frameNumberText.scale.set(0.5);
  frameNumberText.position.set(-10, 16);

  container.addChild(sprite);
  container.addChild(text);
  container.addChild(frameNumberText);
  container.scale.set(2);

  createEffect(() => {
    sprite.spritesheets = assert(allSpritesheets.get(props.modelId));
  });

  createEffect(() => {
    sprite.direction = nearestCardinalDirection(props.angle);
  });

  createEffect(() => {
    sprite.switchAnimationSmoothly(props.animationName);
  });

  createEffect(() => {
    if (props.name) {
      text.text = `${props.name} (${props.angle.toFixed(2)})`;
      text.visible = true;
    } else {
      text.visible = false;
    }
    text.position.set(64, 32);
    container.position.set(props.pos.x, props.pos.y);
    frameNumberText.visible = props.showFrameNumber ?? false;
  });

  createEffect(() => {
    sprite.anchor.set(props.anchor?.x ?? 0, props.anchor?.y ?? 0);
  });

  return (
    <Pixi
      label={`Character (angle: ${props.angle.toFixed(2)})`}
      as={container}
    />
  );
}
