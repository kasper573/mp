import { exponentialBuckets, linearBuckets } from "@mp/telemetry/prom";

/**
 * Buckets for millisecond histograms.
 */
export const msBuckets = [
  ...linearBuckets(0, 0.2, 6),
  ...exponentialBuckets(2, 1.5, 20),
];

/**
 * Buckets for byte count histograms.
 */
export const byteBuckets = exponentialBuckets(1, 2, 20);
