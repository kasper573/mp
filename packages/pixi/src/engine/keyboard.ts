import type { ReadonlySignal } from "@mp/state";
import { signal } from "@mp/state";

export class Keyboard {
  readonly #heldKeys = signal(new Set<KeyName>());

  readonly heldKeys: ReadonlySignal<ReadonlySet<KeyName>> = this.#heldKeys;

  start() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
  }

  stop() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
  }

  isHeld = (key: KeyName) => this.heldKeys.value.has(key);

  subscribe = (key: KeyName, callback: (isDown: boolean) => void) => {
    return this.heldKeys.subscribe((keys) => {
      callback(keys.has(key));
    });
  };

  private onDown = (e: KeyboardEvent) =>
    this.#heldKeys.value.add(e.key as KeyName);
  private onUp = (e: KeyboardEvent) =>
    this.#heldKeys.value.delete(e.key as KeyName);
}

export type KeyName = "Shift" | "Control";
