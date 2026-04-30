import {
  bench,
  boxplot,
  compact,
  do_not_optimize,
  group,
  run,
  summary,
} from "mitata";
import { RiftModule, inject, initializeModules } from "../src/index";

class A0 extends RiftModule {
  init(): () => void {
    return () => {};
  }
}
class A1 extends RiftModule {
  @inject(A0) accessor a0!: A0;
  init(): () => void {
    return () => {};
  }
}
class A2 extends RiftModule {
  @inject(A1) accessor a1!: A1;
  init(): () => void {
    return () => {};
  }
}
class A3 extends RiftModule {
  @inject(A2) accessor a2!: A2;
  @inject(A0) accessor a0!: A0;
  init(): () => void {
    return () => {};
  }
}
class A4 extends RiftModule {
  @inject(A3) accessor a3!: A3;
  @inject(A1) accessor a1!: A1;
  init(): () => void {
    return () => {};
  }
}

class Root extends RiftModule {
  init(): () => void {
    return () => {};
  }
}

function fanout(n: number): object[] {
  const root = new Root();
  const leaves: object[] = [root];
  for (let i = 0; i < n; i++) {
    const Leaf = class extends RiftModule {
      @inject(Root) accessor root!: Root;
      init(): () => void {
        return () => {};
      }
    };
    Object.defineProperty(Leaf, "name", { value: `Leaf${i}` });
    leaves.push(new Leaf());
  }
  return leaves;
}

boxplot(() => {
  summary(() => {
    group("initializeModules: init + cleanup", () => {
      bench("chain x5", async () => {
        const cleanup = await initializeModules([
          new A4(),
          new A3(),
          new A2(),
          new A1(),
          new A0(),
        ]);
        await cleanup();
        do_not_optimize(cleanup);
      });

      const f10 = fanout(10);
      bench("fanout x10", async () => {
        const cleanup = await initializeModules(f10);
        await cleanup();
        do_not_optimize(cleanup);
      });

      const f100 = fanout(100);
      bench("fanout x100", async () => {
        const cleanup = await initializeModules(f100);
        await cleanup();
        do_not_optimize(cleanup);
      });
    });
  });
});

compact(async () => {
  await run();
});
