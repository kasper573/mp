import { atom } from "@mp/state";

export class Keyboard {
  readonly #keysHeld = atom(new Set<KeyName>());

  get keysHeld(): ReadonlySet<KeyName> {
    return this.#keysHeld.get();
  }

  start() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
  }

  stop() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
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
