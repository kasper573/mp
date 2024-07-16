import { EventEmitter } from "events";
import { z } from "@mp/validate";
import { observable } from "@trpc/server/observable";
import { t } from "../definition/trpc";

export function createExampleRouter() {
  const countsPerClient = new Map<string, number>();

  const events = new EventEmitter();
  let counter = 0;

  setInterval(() => events.emit("tick", counter++), 1000);

  return t.router({
    onAdd: t.procedure.input(z.string()).subscription(({ input }) =>
      observable<[number, string]>((emit) => {
        console.log("subscribed to onAdd", { input });
        const e = (n: number) => emit.next([n, input + ": " + n]);
        events.on("tick", e);
        return () => {
          console.log("unsubscribed from onAdd", { input });
          events.off("tick", e);
        };
      }),
    ),
    error: t.procedure.query(() => {
      throw new Error("Manually triggered server side query error");
    }),
    mutationError: t.procedure.mutation(() => {
      throw new Error("Manually triggered server side mutation error");
    }),
    greeting: t.procedure
      .input(z.string())
      .output(z.string())
      .query(({ input: name }) =>
        name.trim() ? `Hello, ${name} from the main branch!` : "",
      ),
    count: t.procedure
      .output(z.number())
      .query(({ ctx }) => countsPerClient.get(ctx.clientId) ?? 0),
    increaseCount: t.procedure
      .input(z.object({ amount: z.number() }))
      .output(z.number())
      .mutation(({ input: { amount }, ctx }) => {
        let myCount = countsPerClient.get(ctx.clientId) ?? 0;
        myCount += amount;
        countsPerClient.set(ctx.clientId, myCount);
        return myCount;
      }),
  });
}
