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

  it("should resolve the 14ms mystery overhead issue", () => {
    // This test demonstrates the fix for the specific issue described
    const metrics = new MetricsRegistry();
    const configuredInterval = TimeSpan.fromMilliseconds(50); // Server configured for 50ms ticks
    const observer = createTickMetricsObserver(metrics, configuredInterval);
    
    const intervalObserveMock = vi.fn();
    const intervalHistogram = metrics.getSingleMetric("server_tick_interval");
    
    if (intervalHistogram && "observe" in intervalHistogram) {
      intervalHistogram.observe = intervalObserveMock;
    }

    // Simulate the original issue: server runs at 50ms intervals but
    // actual time between ticks is ~64ms due to processing overhead
    const mysteryOverhead = 14; // The 14ms overhead from the issue
    const actualTimeBetweenTicks = TimeSpan.fromMilliseconds(50 + mysteryOverhead);
    
    observer({
      timeSinceLastTick: actualTimeBetweenTicks,
      totalTimeElapsed: TimeSpan.fromMilliseconds(1000),
      next: vi.fn(),
    });

    // With the fix, the metric should show the configured 50ms
    // instead of the problematic 64ms (~50ms + 14ms overhead)
    expect(intervalObserveMock).toHaveBeenCalledWith(50);
    expect(intervalObserveMock).not.toHaveBeenCalledWith(64);
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

  it("should work with different configured intervals", () => {
    // Test that the fix works for different tick intervals
    const metrics = new MetricsRegistry();
    const customInterval = TimeSpan.fromMilliseconds(100); // 100ms interval
    const observer = createTickMetricsObserver(metrics, customInterval);
    
    const intervalObserveMock = vi.fn();
    const intervalHistogram = metrics.getSingleMetric("server_tick_interval");
    
    if (intervalHistogram && "observe" in intervalHistogram) {
      intervalHistogram.observe = intervalObserveMock;
    }

    observer({
      timeSinceLastTick: TimeSpan.fromMilliseconds(120), // Actual time with overhead
      totalTimeElapsed: TimeSpan.fromMilliseconds(1000),
      next: vi.fn(),
    });

    // Should report the configured 100ms, not the actual 120ms
    expect(intervalObserveMock).toHaveBeenCalledWith(100);
  });
});