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

  override write(newValue: Obj[Key]): void {
    super.write(newValue);
    this.parentSignal.write({
      ...this.parentSignal.get(),
      [this.property]: newValue,
    });
  }

  override get(): Obj[Key] {
    return this.parentSignal.get()[this.property];
  }
}
