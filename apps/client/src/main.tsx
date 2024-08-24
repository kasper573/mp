import { createRoot } from "react-dom/client";
import type { ComponentProps } from "react";
import { StrictMode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { Providers } from "./ui/Providers";
import { UI } from "./ui/UI";
import { createGame } from "./ecs/Game";
import { AreaLoader } from "./ecs/AreaLoader";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    },
  },
});

const areaLoader = new AreaLoader();
const ui = createRoot(document.querySelector("div#ui")!);
const game = createGame(areaLoader, (debugText) => renderUI({ debugText }));

game.init({
  container: document.querySelector("div#tiled")!,
  resizeTo: window,
});

renderUI({});

function renderUI(props: ComponentProps<typeof UI>) {
  ui.render(
    <StrictMode>
      <Providers queryClient={queryClient}>
        <UI {...props} />
      </Providers>
    </StrictMode>,
  );
}
