import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";

import { PNG } from "pngjs";

// An RGBA frame in pngjs's native layout (4 bytes per pixel, row-major).
export interface Image {
  width: number;
  height: number;
  data: Buffer;
}

// "Basically the same place" as a reference: the matching map scores ~0.83, the other ~0.03, so 0.5
// is a wide margin.
export const MAP_MATCH = 0.5;

export function loadReference(path: string): Image {
  return decode(readFileSync(path));
}

// What the canvas shows: the frames drawn while the game is still loading look like nothing yet. The
// browser build reports nothing of the game's frames, so a slow machine is given minutes rather than a
// frame count.
export async function looksLike(page: Page, reference: Image): Promise<void> {
  const deadline = Date.now() + DRAW_WITHIN_MS;
  let best = 0;
  while (Date.now() < deadline) {
    const shot = decode(await page.locator("#glcanvas").screenshot());
    best = Math.max(best, resemblance(shot, reference));
    if (best >= MAP_MATCH) return;
  }
  throw new Error(`the canvas never looked like the reference (best resemblance ${best.toFixed(2)})`);
}

const DRAW_WITHIN_MS = 300_000;

export function decode(png: Buffer): Image {
  const { width, height, data } = PNG.sync.read(png);
  return { width, height, data };
}

const HIST_BINS = 8;
const HIST_SAMPLES = 64;

function histogram(image: Image): Float64Array {
  const hist = new Float64Array(HIST_BINS * HIST_BINS * HIST_BINS);
  const { width, height, data } = image;
  if (width === 0 || height === 0) return hist;
  const bin = (c: number) => Math.min(Math.floor((c * HIST_BINS) / 256), HIST_BINS - 1);
  for (let ty = 0; ty < HIST_SAMPLES; ty++) {
    for (let tx = 0; tx < HIST_SAMPLES; tx++) {
      const sx = Math.min(Math.floor((tx * width) / HIST_SAMPLES), width - 1);
      const sy = Math.min(Math.floor((ty * height) / HIST_SAMPLES), height - 1);
      const i = 4 * (sy * width + sx);
      hist[(bin(data[i]) * HIST_BINS + bin(data[i + 1])) * HIST_BINS + bin(data[i + 2])] += 1;
    }
  }
  const total = HIST_SAMPLES * HIST_SAMPLES;
  for (let i = 0; i < hist.length; i++) hist[i] /= total;
  return hist;
}

// Color-histogram intersection in [0, 1] (1 identical, 0 no overlap): answers "is this the same
// place" tolerant of the player's position, animation, resolution, and a browser's rendering quirks,
// so one reference snapshot matches across every browser.
export function resemblance(a: Image, b: Image): number {
  const ha = histogram(a);
  const hb = histogram(b);
  let sum = 0;
  for (let i = 0; i < ha.length; i++) sum += Math.min(ha[i], hb[i]);
  return sum;
}
