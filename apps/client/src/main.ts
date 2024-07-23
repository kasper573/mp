import Phaser from "phaser";
import { Scene } from "./Scene";
import { env } from "./env";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  fps: {
    target: 60,
    forceSetTimeOut: true,
    smoothStep: false,
  },
  width: 800,
  height: 600,
  // height: 200,
  backgroundColor: "#b6d53c",
  parent: "phaser-example",
  physics: { default: "arcade" },
  pixelArt: true,
  scene: [Scene],
};

const game = new Phaser.Game(config);

/**
 * Create FPS selector
 */

// current fps label
const fpsInput = document.querySelector<HTMLInputElement>("input#fps")!;
const fpsValueLabel =
  document.querySelector<HTMLSpanElement>("span#fps-value")!;
fpsValueLabel.innerText = fpsInput.value;

fpsInput.oninput = (event) => {
  const value = (event.target as HTMLInputElement).value;
  fpsValueLabel.innerText = value;

  // destroy previous loop
  game.loop.destroy();

  // create new loop
  game.loop = new Phaser.Core.TimeStep(game, {
    target: parseInt(value),
    forceSetTimeOut: true,
    smoothStep: false,
  });

  // start new loop
  game.loop.start(game.step.bind(game));
};

/**
 * Create latency simulation selector
 */
let fetchLatencySimulationInterval: NodeJS.Timeout;

// latency simulation label
const latencyInput = document.querySelector<HTMLInputElement>("input#latency")!;

// current latency label
const selectedLatencyLabel =
  document.querySelector<HTMLInputElement>("#latency-value")!;
selectedLatencyLabel.innerText = `${latencyInput.value} ms`;

latencyInput.onpointerdown = (event: PointerEvent) =>
  clearInterval(fetchLatencySimulationInterval);

latencyInput.oninput = () =>
  (selectedLatencyLabel.innerText = `${latencyInput.value} ms`);

latencyInput.onchange = () => {
  // request server to update its latency simulation
  fetch(`${env.httpServerUrl}/simulate-latency/${latencyInput.value}`);

  setIntervalFetchLatencySimulation();
};

function setIntervalFetchLatencySimulation() {
  //
  // Keep fetching latency simulation number from server to keep all browser tabs in sync
  //
  fetchLatencySimulationInterval = setInterval(() => {
    fetch(`${env.httpServerUrl}/latency`)
      .then((response) => response.json())
      .then((value) => {
        latencyInput.value = value;
        latencyInput.oninput?.(new Event("input"));
      });
  }, 1000);
}
setIntervalFetchLatencySimulation();
