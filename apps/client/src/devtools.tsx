import { SolidQueryDevtools } from "@mp/solid-trpc/devtools";
import type { AnyRouter } from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";

export default function Devtools(props: { router: AnyRouter }) {
  return (
    <>
      <TanStackRouterDevtools router={props.router} />
      <SolidQueryDevtools />
    </>
  );
}
