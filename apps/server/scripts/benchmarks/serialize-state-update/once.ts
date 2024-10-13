import { Logger } from "@mp/logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  benchmark,
  sizeString,
  durationString,
  total,
  average,
  median,
  min,
  max,
  implementationNames,
} from "./shared";

const logger = new Logger(console);
const { stateSize, iterations, implementation } = readCliOptions();
const { times, size } = benchmark(stateSize, iterations, implementation);

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
    .option("stateSize", {
      alias: "s",
      type: "number",
      demandOption: true,
      default: 10,
    })
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
