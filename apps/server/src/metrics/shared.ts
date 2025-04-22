import { exponentialBuckets } from "@mp/telemetry/prom";

/**
 * Buckets for millisecond histograms.
 */
export const msBuckets = exponentialBuckets(0.01, 2, 20);

/**
 * Buckets for byte count histograms.
 */
export const byteBuckets = exponentialBuckets(1, 2, 20);
