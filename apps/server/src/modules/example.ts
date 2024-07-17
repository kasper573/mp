import { EventEmitter } from "events";
import { z } from "@mp/validate";
import { observable } from "@trpc/server/observable";
import { t } from "../definition/trpc";

export interface Message {
  from: string;
  contents: string;
}

export function createExampleRouter() {
  const countsPerClient = new Map<string, number>();

  const bus = new EventEmitter();

  function broadcast(message: Message) {
    console.log("Broadcasting message", message);
    bus.emit("message", message);
  }

  // let count = 0;
  // setInterval(
  //   () => broadcast({ from: "server", contents: `count: ${count++}` }),
  //   1000,
  // );

  return t.router({
    say: t.procedure.input(z.string()).mutation(({ ctx, input }) => {
      broadcast({ from: ctx.clientId, contents: input });
    }),
    chat: t.procedure.subscription(({ ctx }) =>
      observable<Message>((emit) => {
        bus.on("message", emit.next);
        broadcast({ from: ctx.clientId, contents: "connected" });
        return () => {
          broadcast({ from: ctx.clientId, contents: "disconnected" });
          bus.off("message", emit.next);
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

enum MissionType {
  A,
  B,
}

function withQualityAdjectives(type: MissionType) {
  return z.object({
    type: z.literal(type),
    name: z.string(),
    quantity: z.number(),
    qualityAdjectives: z.array(z.string()),
    requiredQuality: z.number(),
    requiredQuantity: z.number(),
  });
}

const a = withQualityAdjectives(MissionType.A);
const b = withQualityAdjectives(MissionType.B);

const mission = z.union([a, b]);
