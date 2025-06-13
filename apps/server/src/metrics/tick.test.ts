import { describe, it, expect, vi } from "vitest";
import { TimeSpan } from "@mp/time";
import { MetricsRegistry } from "@mp/telemetry/prom";
import { createTickMetricsObserver } from "./tick";

describe("createTickMetricsObserver", () => {
  it("should observe configured interval rather than actual time between ticks", () => {
    const metrics = new MetricsRegistry();
    const configuredInterval = TimeSpan.fromMilliseconds(50);
    const observer = createTickMetricsObserver(metrics, configuredInterval);
    
    // Mock the histogram observe method to capture the values
    const intervalObserveMock = vi.fn();
    const durationObserveMock = vi.fn();
    
    // Get the histogram instances to mock their observe methods
    const intervalHistogram = metrics.getSingleMetric("server_tick_interval");
    const durationHistogram = metrics.getSingleMetric("server_tick_duration");
    
    if (intervalHistogram && "observe" in intervalHistogram) {
      intervalHistogram.observe = intervalObserveMock;
    }
    if (durationHistogram && "observe" in durationHistogram) {
      durationHistogram.observe = durationObserveMock;
    }

    // Simulate a tick event where actual time between ticks is 64ms
    // but the configured interval should be 50ms
    const mockNext = vi.fn();
    const actualTimeBetweenTicks = TimeSpan.fromMilliseconds(64); // includes processing overhead
    
    observer({
      timeSinceLastTick: actualTimeBetweenTicks,
      totalTimeElapsed: TimeSpan.fromMilliseconds(1000),
      next: mockNext,
    });

    // The interval metric should observe the configured interval (50ms)
    // not the actual time between ticks (64ms)
    expect(intervalObserveMock).toHaveBeenCalledWith(50);
    
    // The duration metric should still measure actual processing time
    expect(durationObserveMock).toHaveBeenCalledWith(expect.any(Number));
    
    // The next function should be called
    expect(mockNext).toHaveBeenCalled();
  });

  it("should measure actual processing duration", () => {
    const metrics = new MetricsRegistry();
    const configuredInterval = TimeSpan.fromMilliseconds(50);
    const observer = createTickMetricsObserver(metrics, configuredInterval);
    
    const durationObserveMock = vi.fn();
    const durationHistogram = metrics.getSingleMetric("server_tick_duration");
    
    if (durationHistogram && "observe" in durationHistogram) {
      durationHistogram.observe = durationObserveMock;
    }

    const mockNext = vi.fn(() => {
      // Simulate some processing time
      const start = performance.now();
      while (performance.now() - start < 10) {
        // busy wait for ~10ms
      }
    });

    observer({
      timeSinceLastTick: TimeSpan.fromMilliseconds(64),
      totalTimeElapsed: TimeSpan.fromMilliseconds(1000),
      next: mockNext,
    });

    // The duration should be measured (approximately 10ms, but could vary)
    expect(durationObserveMock).toHaveBeenCalledWith(expect.any(Number));
    const measuredDuration = durationObserveMock.mock.calls[0]?.[0] as number;
    expect(measuredDuration).toBeGreaterThan(5); // Should be at least 5ms
    expect(measuredDuration).toBeLessThan(50); // Should be less than 50ms
  });
});