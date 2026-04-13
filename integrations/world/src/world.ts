import { RiftWorld } from "@rift/core";
import { allComponents } from "./components";
import { allEvents } from "./events";

export const world = new RiftWorld({
  components: allComponents,
  events: allEvents,
});
