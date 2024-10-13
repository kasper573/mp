import type { AreaId } from "@mp/data";
import { Vector } from "@mp/math";
import { Logger } from "@mp/logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { CharacterId, WorldState } from "../../../src/package";
import { benchmarkState } from "./shared";
import {
  sizeString,
  durationString,
  total,
  average,
  median,
  min,
  max,
  implementationNames,
} from "./shared";

const snapshot: WorldState = {
  serverTick: 24.083_902_999_758_72,
  characters: new Map([
    [
      "user_2lnfR3uQvsPNltWDa3l7xiCoScV" as CharacterId,
      {
        id: "user_2lnfR3uQvsPNltWDa3l7xiCoScV" as CharacterId,
        coords: new Vector(28, 19),
        areaId: "forest" as AreaId,
        speed: 3,
      },
    ],
  ]),
};

const logger = new Logger(console);
const { iterations, implementation } = readCliOptions();
const { times, size } = benchmarkState(snapshot, iterations, implementation);

logger.info(
  [
    `implementation: ${implementation}`,
    `state size: ${sizeString(size)}`,
    `iterations: ${iterations}`,
    `time (total): ${durationString(total(times))}`,
    `time (average): ${durationString(average(times))}`,
    `time (min): ${durationString(min(times))}`,
    `time (max): ${durationString(max(times))}`,
    `time (median): ${durationString(median(times))}`,
  ].join("\n"),
);

export function readCliOptions(argv = process.argv) {
  return yargs(hideBin(argv))
    .option("iterations", {
      alias: "n",
      type: "number",
      default: 674,
    })
    .option("implementation", {
      alias: "i",
      type: "string",
      choices: implementationNames,
      demandOption: true,
    })
    .parseSync();
}
