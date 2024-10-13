import { Vector } from "@mp/math";
import type { AreaId } from "@mp/data";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import { Logger } from "@mp/logger";
import {
  serialization,
  type Character,
  type CharacterId,
  type WorldState,
} from "../../../src/package";
import { jsonSerialization } from "../../../src/jsonSerialization";

export const implementations = {
  json: jsonSerialization.stateUpdate.serialize,
  cbor: serialization.stateUpdate.serialize,
} satisfies Record<string, StateSerializer>;

type ImplementationName = keyof typeof implementations;
export const implementationNames = Object.keys(
  implementations,
) as Array<ImplementationName>;

if (require.main === module) {
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
}

type StateSerializer = (state: WorldState) => string | ArrayBuffer;

export function benchmark(
  stateSize: number,
  iterations: number,
  implementation: ImplementationName,
) {
  const serialize = implementations[implementation];
  const state = generateState(stateSize);
  const size = serializedSize(serialize(state));

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    serialize(state);
    const end = performance.now();
    times.push(end - start);
  }
  return { size, times };
}

function generateState(n: number): WorldState {
  return {
    characters: new Map(
      range(n).map((i) => {
        const char = generateCharacter(i);
        return [char.id, char];
      }),
    ),
  };
}

function generateCharacter(n: number): Character {
  const id = `character${n}` as CharacterId;
  return {
    id,
    areaId: `area${n}` as AreaId,
    coords: generateVector(n),
    speed: n,
    path: range(n).map((i) => generateVector(n + i)),
  };
}

function generateVector(n: number): Vector {
  return new Vector(n, n * 2);
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

type CLIOptions = ReturnType<typeof readCliOptions>;
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

function serializedSize(serialized: string | ArrayBuffer): number {
  if (typeof serialized === "string") {
    return serialized.length * 2;
  }
  return serialized.byteLength;
}

export function total(times: number[]) {
  return times.reduce((acc, time) => acc + time, 0);
}

export function average(times: number[]) {
  return total(times) / times.length;
}

function min(times: number[]) {
  return Math.min(...times);
}

function max(times: number[]) {
  return Math.max(...times);
}

function median(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function durationString(ms: number) {
  if (ms < 1000) {
    return `${ms.toFixed(2)} ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)} s`;
  }
  const minutes = seconds / 60;
  return `${minutes.toFixed(2)} m`;
}

export function sizeString(b: number) {
  if (b < 1000) {
    return `${b.toFixed(2)}b`;
  }
  const kb = b / 1024;
  if (kb < 1000) {
    return `${kb.toFixed(2)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(2)}MB`;
}
