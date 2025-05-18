import { defineRoles, roles, rpc } from "@mp/game/server";
import { TimeSpan } from "@mp/time";
import { opt } from "../options";

let fakeTickInterval = TimeSpan.fromMilliseconds(0);

export const systemRoles = defineRoles("sys", ["admin"]);

export const systemRouter = rpc.router({
  buildVersion: rpc.procedure.output<string>().query(() => opt.buildVersion),
  testError: rpc.procedure.output<string>().query(() => {
    throw new Error("This is a test error that was thrown in the server");
  }),
  serverTickInterval: rpc.procedure
    .use(roles([systemRoles.admin]))
    .output<TimeSpan>()
    .query(() => fakeTickInterval),
  setServerTickInterval: rpc.procedure
    .use(roles([systemRoles.admin]))
    .input<TimeSpan>()
    .mutation(({ input }) => {
      fakeTickInterval = input;
    }),
});
