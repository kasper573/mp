import { RiftWorld } from "@rift/core";
import { allComponents } from "./components";
import { allEvents } from "./events";

export function createWorld(): RiftWorld {
  return new RiftWorld({
    components: [...allComponents],
    events: [...allEvents],
  });
}
