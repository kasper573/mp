import sharp from "sharp";

/**
 * Compares two images and returns a resemblance score between 0 and 1.
 * This uses color histogram comparison which is tolerant of position changes
 * and focuses on whether the images show "basically the same thing".
 *
 * A score of 1 means identical color distribution, 0 means completely different.
 * Scores above 0.7 typically indicate the images show similar content.
 */
export async function getImageResemblance(
  imagePath1: string,
  imagePath2: string | Buffer,
): Promise<number> {
  const histogram1 = await getColorHistogram(imagePath1);
  const histogram2 = await getColorHistogram(imagePath2);

  return histogramIntersection(histogram1, histogram2);
}

/**
 * Builds a color histogram from an image.
 * Resizes the image to normalize it and reduce noise from small details.
 */
async function getColorHistogram(
  imagePath: string | Buffer,
): Promise<number[]> {
  // Resize to a small size to normalize and blur out fine details
  // This makes the comparison more tolerant of position changes
  const { data, info } = await sharp(imagePath)
    .resize(64, 64, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Create histogram with 8 bins per channel (8x8x8 = 512 buckets)
  const binsPerChannel = 8;
  const totalBins = binsPerChannel ** 3;
  const histogram = new Array(totalBins).fill(0);

  const pixelCount = info.width * info.height;
  const channels = info.channels;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * channels;
    const r = Math.floor((data[offset] / 256) * binsPerChannel);
    const g = Math.floor((data[offset + 1] / 256) * binsPerChannel);
    const b = Math.floor((data[offset + 2] / 256) * binsPerChannel);

    const binIndex =
      r * binsPerChannel * binsPerChannel + g * binsPerChannel + b;
    histogram[binIndex]++;
  }

  // Normalize histogram
  for (let i = 0; i < totalBins; i++) {
    histogram[i] /= pixelCount;
  }

  return histogram;
}

/**
 * Calculates histogram intersection - a similarity metric between 0 and 1.
 * 1 means identical distributions, 0 means no overlap.
 */
function histogramIntersection(hist1: number[], hist2: number[]): number {
  let intersection = 0;
  for (let i = 0; i < hist1.length; i++) {
    intersection += Math.min(hist1[i], hist2[i]);
  }
  return intersection;
}
