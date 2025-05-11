import { Application, Pixi } from "@mp/solid-pixi";
import { createEffect, createMemo, For, onCleanup, useContext } from "solid-js";
import { Container, Text } from "pixi.js";
import { Vector } from "@mp/math";
import { EngineContext, EngineProvider } from "@mp/engine";
import { createCharacterSprite, directionAngles } from "./character-sprite";
import { loadCharacterSpritesheetForState } from "./character-sprite-state";

export function CharacterTester() {
  return (
    <Application style={{ display: "flex", flex: 1 }}>
      {({ viewport }) => (
        <EngineProvider viewport={viewport}>
          <For each={Object.entries(directionAngles)}>
            {([name, angle], index) => (
              <SpecificCharacterAngle
                angle={angle}
                name={name}
                pos={new Vector(0, index() * 64)}
              />
            )}
          </For>
          <DynamicCharacterAngle />
        </EngineProvider>
      )}
    </Application>
  );
}

function DynamicCharacterAngle() {
  const center = useScreenCenter();
  const engine = useContext(EngineContext);
  const angle = createMemo(() => center().angle(engine.pointer.position));
  return (
    <>
      <SpecificCharacterAngle
        angle={angle()}
        pos={center()}
        anchor={new Vector(0.5, 0.5)}
        showFrameNumber
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

function SpecificCharacterAngle(props: {
  angle: number;
  name?: string;
  pos: Vector<number>;
  anchor?: Vector<number>;
  showFrameNumber?: boolean;
}) {
  const engine = useContext(EngineContext);
  const sprite = createCharacterSprite(() => props.angle, walk);
  const container = new Container();
  const text = new Text({ style: { fill: "white", fontSize: "7px" } });
  const frameNumberText = new Text({
    style: { fill: "white", fontSize: "7px" },
  });
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

const walk = await loadCharacterSpritesheetForState("walk-shooting");
