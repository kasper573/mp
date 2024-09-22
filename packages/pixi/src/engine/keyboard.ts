import { atom } from "@mp/state";

export class Keyboard {
  readonly #heldKeys = atom(new Set<KeyName>());

  get heldKeys(): ReadonlySet<KeyName> {
    return this.#heldKeys.get();
  }

  start() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
  }

  stop() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
  }

  isHeld = (key: KeyName) => this.heldKeys.has(key);

  private onDown = (e: KeyboardEvent) =>
    this.#heldKeys.get().add(e.key as KeyName);
  private onUp = (e: KeyboardEvent) =>
    this.#heldKeys.get().delete(e.key as KeyName);
}

export type KeyName = "Shift" | "Control";
