import { err, ok, Result } from "neverthrow";

export function toResult<Value, Err>(obj: {
  data?: Value;
  error?: Err;
}): Result<Value, Err> {
  if (obj.error) {
    return err(obj.error);
  }
  if (obj.data === undefined) {
    return err(new Error("Value was undefined") as Err);
  }
  return ok(obj.data);
}
