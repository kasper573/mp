import { enablePatches, original, produceWithPatches, type Patch } from "immer";

enablePatches();

export class PatchObserver<State> {
  constructor(public current: State) {}

  update = <Result>(accessFn: (state: State) => Result): [Result, Patch[]] => {
    let result!: Result;

    const [nextState, patches] = produceWithPatches(this.current, (draft) => {
      result = accessFn(draft as State);

      if (result && typeof result === "object") {
        result = original(result) as Result;
      }
      if (result instanceof Promise) {
        throw new TypeError("State access mutations may not be asynchronous");
      }
    });

    this.current = nextState;

    return [result, patches];
  };
}
