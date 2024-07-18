import { t } from "../definition";

export type OtherModule = ReturnType<typeof createOtherModule>;
export function createOtherModule() {
  return t.module({
    do: t.event.payload<string>().create(({ context, payload }) => {
      console.log("Doing", payload);
    }),
  });
}
