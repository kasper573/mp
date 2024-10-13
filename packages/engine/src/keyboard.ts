import { atom } from "@mp/state";

export class Keyboard {
  readonly #keysHeld = atom(new Set<KeyName>());

  constructor(private window: Window) {}

  get keysHeld(): ReadonlySet<KeyName> {
    return this.#keysHeld.get();
  }

  start() {
    this.window.addEventListener("keydown", this.onDown);
    this.window.addEventListener("keyup", this.onUp);
  }

  stop() {
    this.window.removeEventListener("keydown", this.onDown);
    this.window.removeEventListener("keyup", this.onUp);
  }

  private onDown = (e: KeyboardEvent) => {
    const key = e.key as KeyName;
    this.#keysHeld.set((current) =>
      current.has(key) ? current : current.union(new Set([key])),
    );
  };

  private onUp = (e: KeyboardEvent) => {
    const key = e.key as KeyName;
    this.#keysHeld.set((current) =>
      current.has(key) ? current.difference(new Set([key])) : current,
    );
  };
}

export type KeyName = "Shift" | "Control";
