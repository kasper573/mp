import { createRoot } from "react-dom/client";
import { createElement, StrictMode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { Providers } from "./components/Providers";
import { App } from "./components/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

const rootElement = document.querySelector("div#root")!;

createRoot(rootElement).render(
  createElement(
    StrictMode,
    {},
    createElement(Providers, { queryClient, children: createElement(App) }),
  ),
);
