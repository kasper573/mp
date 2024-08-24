import { Vector } from "@mp/math";
import { TimeSpan } from "@mp/state";

export const engine = {
  ticker: {
    deltaTime: TimeSpan.fromMilliseconds(0),
  },
  input: {
    pointer: {
      lastWorldPos: new Vector(0, 0),
    },
    keyboard: {
      isHeld: (key: KeyName) => heldKeys.has(key),
    },
  },
};

const heldKeys = new Set<KeyName>();

let previousFrame = performance.now();
const nextFrame: FrameRequestCallback = () => {
  const thisFrame = performance.now();
  const deltaTime = TimeSpan.fromMilliseconds(thisFrame - previousFrame);
  previousFrame = thisFrame;
  engine.ticker.deltaTime = deltaTime;

  requestAnimationFrame(nextFrame);
};

window.addEventListener("mousemove", (e) => {
  engine.input.pointer.lastWorldPos = new Vector(e.clientX, e.clientY);
});

window.addEventListener("keydown", (e) => {
  heldKeys.add(e.key as KeyName);
});

window.addEventListener("keyup", (e) => {
  heldKeys.delete(e.key as KeyName);
});

requestAnimationFrame(nextFrame);

export type KeyName = "Shift" | "Control";
