import {
  MeshSimple,
  type FrameObject,
  type SimpleMeshOptions,
  Ticker,
} from "@mp/graphics";

/**
 * Like a Mesh, but with animated frames.
 * Always on, always looping.
 */
export class AnimatedMesh extends MeshSimple {
  private frameIndex = 0;
  private elapsed = 0;

  constructor(
    private frames: FrameObject[],
    options: Omit<SimpleMeshOptions, "texture">,
  ) {
    super({ texture: frames[0].texture, ...options });
    this.onRender = this.#onRender;
  }

  #onRender = (): void => {
    this.elapsed += Ticker.shared.deltaMS;

    const frameObj = this.frames[this.frameIndex];
    if (this.elapsed >= frameObj.time) {
      this.elapsed -= frameObj.time;
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.texture = this.frames[this.frameIndex].texture;
    }
  };
}
