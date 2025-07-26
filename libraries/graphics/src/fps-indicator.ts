import type { StrokeStyle, TextStyle } from "pixi.js";
import { Container, Text } from "pixi.js";

export class FpsIndicator extends Container {
  private text = new Text({
    style: {
      fill: "white",
      fontSize: 28,
      fontWeight: "bold",
      stroke: { color: "black", width: 4 } satisfies Partial<StrokeStyle>,
    } satisfies Partial<TextStyle>,
  });

  constructor() {
    super();

    this.addChild(this.text);
    this.onRender = this.#onRender;
  }

  private framesCounted = 0;
  private intervalSeconds = 1;
  private nextUpdate = performance.now() + this.intervalSeconds * 1000;
  private fps = 0;

  #onRender = () => {
    const currentTime = performance.now();

    if (currentTime > this.nextUpdate) {
      this.fps = this.framesCounted / this.intervalSeconds;
      this.nextUpdate = currentTime + this.intervalSeconds * 1000;
      this.framesCounted = 0;
    }

    this.text.text = `FPS: ${this.fps.toFixed(2)}, Frame: ${this.framesCounted++}`;
  };
}
