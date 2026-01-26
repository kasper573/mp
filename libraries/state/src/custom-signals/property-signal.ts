import { Signal } from "../signal";

export class PropertySignal<
  Obj extends object,
  Key extends keyof Obj,
> extends Signal<Obj[Key]> {
  constructor(
    private signal: Signal<Obj>,
    private property: Key,
  ) {
    super(signal.get()[property]);
  }

  override set(newValue: Obj[Key] | ((prev: Obj[Key]) => Obj[Key])): void {
    if (typeof newValue === "function") {
      const fn = newValue as (prev: Obj[Key]) => Obj[Key];
      const resolved = fn(this.get());
      super.set(resolved);
      this.signal.set({
        ...this.signal.get(),
        [this.property]: resolved,
      });
    } else {
      super.set(newValue);
      this.signal.set({
        ...this.signal.get(),
        [this.property]: newValue,
      });
    }
  }

  override get(): Obj[Key] {
    return this.signal.get()[this.property];
  }
}
