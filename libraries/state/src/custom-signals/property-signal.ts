import { Signal } from "../signal";

export class PropertySignal<
  Obj extends object,
  Key extends keyof Obj,
> extends Signal<Obj[Key]> {
  constructor(
    private signal: Signal<Obj>,
    private property: Key,
  ) {
    super(signal.value[property]);
  }

  override set value(newValue: Obj[Key]) {
    super.value = newValue;
    this.signal.value = {
      ...this.signal.value,
      [this.property]: newValue,
    };
  }

  override get value(): Obj[Key] {
    return this.signal.value[this.property];
  }
}
