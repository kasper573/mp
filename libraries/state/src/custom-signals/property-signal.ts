import { Signal } from "../signal";

export class PropertySignal<
  Obj extends object,
  Key extends keyof Obj,
> extends Signal<Obj[Key]> {
  constructor(
    private parentSignal: Signal<Obj>,
    private property: Key,
  ) {
    super(parentSignal.get()[property]);
  }

  override set(newValue: Obj[Key]): void {
    super.set(newValue);
    this.parentSignal.set({
      ...this.parentSignal.get(),
      [this.property]: newValue,
    });
  }

  override get(): Obj[Key] {
    return this.parentSignal.get()[this.property];
  }
}
