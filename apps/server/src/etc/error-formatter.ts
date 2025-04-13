import { RPCError, type RPCErrorFormatter } from "@mp/rpc";
import { opt } from "../options";

export const errorFormatter: RPCErrorFormatter<unknown> = ({ error }) => {
  return opt.exposeErrorDetails
    ? error
    : new RPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      });
};
