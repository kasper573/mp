import { it } from "vitest";
import { createEventBus } from "../src/EventBus";

it("it can initialize without throwing an error", () => {
  type Events = {
    message: (payload: string) => void;
    ping: (payload: number) => void;
  };

  createEventBus<Events>({} as never, () => () => {});
});
