import sharp from "sharp";

export interface ImageShift {
  /**
   * Pixels in the original image's coordinate space.
   *
   * A positive `dx` means features in image A correspond to features in
   * image B shifted LEFT, i.e. the camera moved to the RIGHT between A and
   * B. Likewise positive `dy` means the camera moved DOWN.
   */
  dx: number;
  dy: number;
  /**
   * 0..1: how much better the best-fitting shift fits compared to no
   * shift. Low confidence means there is no clear translation between the
   * two images (e.g. the scene changed for some reason other than
   * panning).
   */
  confidence: number;
}

/**
 * Estimates the translation between two images using brute-force template
 * matching on a downsampled grayscale version. Suitable for detecting
 * camera panning on a tile-based game canvas where the underlying scene is
 * mostly the same content shifted by some amount.
 */
export async function detectImageShift(
  imgA: Buffer | string,
  imgB: Buffer | string,
  options: { maxShiftPixels: number; downsampleFactor?: number },
): Promise<ImageShift> {
  const downsampleFactor = options.downsampleFactor ?? 12;

  const metaA = await sharp(imgA).metadata();
  const fullW = metaA.width ?? 0;
  const fullH = metaA.height ?? 0;
  const w = Math.max(8, Math.floor(fullW / downsampleFactor));
  const h = Math.max(8, Math.floor(fullH / downsampleFactor));

  const [a, b] = await Promise.all([
    sharp(imgA).resize(w, h, { fit: "fill" }).grayscale().raw().toBuffer(),
    sharp(imgB).resize(w, h, { fit: "fill" }).grayscale().raw().toBuffer(),
  ]);

  const scaleX = fullW / w;
  const scaleY = fullH / h;
  const maxShiftSamplesX = Math.max(
    1,
    Math.ceil(options.maxShiftPixels / scaleX),
  );
  const maxShiftSamplesY = Math.max(
    1,
    Math.ceil(options.maxShiftPixels / scaleY),
  );

  // A 5%-trimmed border around the canvas screenshot tends to contain UI
  // chrome (inventory label, top-right username box) and feathered edges
  // from the canvas border that do not pan with the camera. Trim it from
  // the comparison so the static UI does not bias the search.
  const margin = Math.floor(Math.min(w, h) * 0.05);

  const meanAbsDiff = (dx: number, dy: number): number => {
    // Compare A[y][x] against B[y - dy][x - dx]. Positive (dx, dy) means
    // features in A appear shifted up-left in B (camera moved right/down).
    let total = 0;
    let count = 0;
    const yStart = Math.max(margin, dy + margin);
    const yEnd = Math.min(h - margin, h - margin + dy);
    const xStart = Math.max(margin, dx + margin);
    const xEnd = Math.min(w - margin, w - margin + dx);
    for (let y = yStart; y < yEnd; y++) {
      const ay = y * w;
      const by = (y - dy) * w;
      for (let x = xStart; x < xEnd; x++) {
        total += Math.abs(a[ay + x] - b[by + (x - dx)]);
        count++;
      }
    }
    return count > 0 ? total / count : Number.POSITIVE_INFINITY;
  };

  const baseline = meanAbsDiff(0, 0);
  let best = { dx: 0, dy: 0, score: baseline };
  for (let dy = -maxShiftSamplesY; dy <= maxShiftSamplesY; dy++) {
    for (let dx = -maxShiftSamplesX; dx <= maxShiftSamplesX; dx++) {
      if (dx === 0 && dy === 0) continue;
      const score = meanAbsDiff(dx, dy);
      if (score < best.score) {
        best = { dx, dy, score };
      }
    }
  }

  const confidence =
    baseline > 0 ? Math.max(0, (baseline - best.score) / baseline) : 0;

  return {
    dx: Math.round(best.dx * scaleX),
    dy: Math.round(best.dy * scaleY),
    confidence,
  };
}

export interface PaletteRatios {
  /** Forest grass (saturated green). */
  forestGreen: number;
  /** Forest dirt / aggro tint (saturated red). */
  forestRed: number;
  /** Island sand (warm yellow). */
  beachSand: number;
  /** Island ocean (saturated blue). */
  beachWater: number;
}

/**
 * Computes the fraction of pixels in the image that fall into each of the
 * known map palette buckets. Forest tiles are dominated by green grass and
 * red dirt; island tiles are dominated by sand and water. The ratios let a
 * test confirm "this looks like the forest / island" purely from pixel
 * statistics, without depending on a fragile per-frame snapshot.
 */
export async function analyzeAreaPalette(
  img: Buffer | string,
): Promise<PaletteRatios> {
  const { data, info } = await sharp(img)
    .resize(128, 128, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const pixelCount = info.width * info.height;
  const counts = {
    forestGreen: 0,
    forestRed: 0,
    beachSand: 0,
    beachWater: 0,
  };

  for (let i = 0; i < pixelCount; i++) {
    const o = i * channels;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];

    if (g > 90 && g > r + 20 && g > b + 20) {
      counts.forestGreen++;
    } else if (r > 90 && r > g + 30 && r > b + 30) {
      counts.forestRed++;
    } else if (b > 90 && b > r + 20 && b > g - 10) {
      counts.beachWater++;
    } else if (r > 150 && g > 130 && b > 80 && b < r - 30) {
      counts.beachSand++;
    }
  }

  return {
    forestGreen: counts.forestGreen / pixelCount,
    forestRed: counts.forestRed / pixelCount,
    beachSand: counts.beachSand / pixelCount,
    beachWater: counts.beachWater / pixelCount,
  };
}
