import { createContext } from "solid-js";

export const BuildVersionContext = createContext({
  server: () => "unknown" as string,
  client: () => "unknown" as string,
});
