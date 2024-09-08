import type { Router } from "./router";

declare module "@tanstack/react-router" {
  interface Register {
    router: Router;
  }
}
