export const transports = ["websocket"] as ["websocket"];

/**
 * A human readable composition of module and event name
 */
export const id = (moduleName: PropertyKey, eventName: PropertyKey) =>
  `${String(moduleName)}.${String(eventName)}`;
