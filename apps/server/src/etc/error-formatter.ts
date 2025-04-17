import { RpcError, type RpcErrorFormatter } from "@mp/rpc";
import { opt } from "../options";

export const errorFormatter: RpcErrorFormatter<unknown> = ({ error }) => {
  return opt.exposeErrorDetails ? error : new RpcError("Internal server error");
};
