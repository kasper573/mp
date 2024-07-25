import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

export function Providers({
  children,
  queryClient,
}: {
  queryClient: QueryClient;
  children?: ReactNode;
}) {
  return (
    <>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </>
  );
}
