import { Application, Pixi } from "@mp/solid-pixi";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
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

import type { ActorModelId } from "../../server/traits/appearance";
import { ActorSpritesheetContext, createActorSprite } from "./actor-sprite";
import type { ActorSpriteState } from "./actor-sprite-state";
import {
  ActorSpritesheetProvider,
  actorSpriteStates,
} from "./actor-sprite-state";

export function ActorSpriteTester() {
  return (
    <Application style={{ display: "flex", flex: 1 }}>
      {({ viewport }) => (
        <EngineProvider viewport={viewport}>
          <ActorSpritesheetProvider>
            <ActorSpriteList />
          </ActorSpritesheetProvider>
        </EngineProvider>
      )}
    </Application>
  );
}

function ActorSpriteList() {
  const allModelIds = useContext(ActorSpritesheetContext).keys().toArray();
  const [state, setState] = createSignal<ActorSpriteState>("walk-normal");
  const [modelId, setModelId] = createSignal(allModelIds[0]);
  return (
    <>
      <For each={Object.entries(cardinalDirectionAngles)}>
        {([name, angle], index) => (
          <SpecificActorAngle
            modelId={modelId()}
            state={state()}
            angle={angle}
            name={name}
            pos={new Vector(0, index() * 64)}
          />
        )}
      </For>
      <DynamicActorAngle modelId={modelId()} state={state()} />
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
          value={state()}
          onChange={setState}
          options={actorSpriteStates}
        />
        <Select value={modelId()} onChange={setModelId} options={allModelIds} />
      </div>
    </>
  );
}

function DynamicActorAngle(props: {
  modelId: ActorModelId;
  state: ActorSpriteState;
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
        state={props.state}
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
  state: ActorSpriteState;
}) {
  const engine = useContext(EngineContext);
  const sprite = createActorSprite(
    () => props.modelId,
    () => props.state,
    () => nearestCardinalDirection(props.angle),
  );
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

  function updateFrameText() {
    frameNumberText.text = `Frame: ${sprite.currentFrame}`;
  }

  onCleanup(engine.addFrameCallback(updateFrameText));

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
