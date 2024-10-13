import { Logger } from "@mp/logger";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  average,
  benchmark,
  durationString,
  implementationNames,
  sizeString,
  total,
} from "./once";

if (require.main === module) {
  const logger = new Logger(console);
  const { begin, end, offset, iterations, implementation } = readCliOptions();

  logger.info(
    `Benchmarking ${implementation} at ${iterations} iterations from ${begin} to ${end} with offset ${offset}`,
  );

  for (let n = begin; n <= end; n += offset) {
    const { times, size } = benchmark(n, iterations, implementation);
    logger.info(
      [
        `N: ${n}`,
        `state: ${sizeString(size)}`,
        `time (avg): ${durationString(average(times))}`,
        `time (total): ${durationString(total(times))}`,
      ].join("\t"),
    );
  }
}

type CLIOptions = ReturnType<typeof readCliOptions>;
export function readCliOptions(argv = process.argv) {
  return yargs(hideBin(argv))
    .option("implementation", {
      alias: "i",
      type: "string",
      choices: implementationNames,
      demandOption: true,
    })
    .option("iterations", {
      alias: "n",
      type: "number",
      default: 674,
    })
    .option("begin", {
      alias: "b",
      type: "number",
      default: 1,
    })
    .option("end", {
      alias: "e",
      type: "number",
      default: 100,
    })
    .option("offset", {
      alias: "o",
      type: "number",
      default: 8,
    })
    .parseSync();
}
