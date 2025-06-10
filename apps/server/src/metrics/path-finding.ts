import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  trace,
  context,
  SpanStatusCode,
  SpanKind,
} from "@mp/telemetry/otel";
import { MetricsHistogram, exponentialBuckets } from "@mp/telemetry/prom";
import { beginMeasuringTimeSpan } from "@mp/time";
import { getGlobalMetricsRegistry } from "./registry";

type NgraphModule = {
  aStar: (graph: unknown, options: unknown) => NgraphPathFinder;
};

type NgraphPathFinder = {
  find: (fromId: string, toId: string) => unknown[] | null;
};

export class NgraphPathInstrumentation extends InstrumentationBase {
  private findPathHistogram?: MetricsHistogram;

  constructor() {
    super("@mp/ngraph-path-instrumentation", "1.0.0", {});
  }

  private ensureHistogram() {
    if (!this.findPathHistogram) {
      const metricsRegistry = getGlobalMetricsRegistry();
      if (metricsRegistry) {
        this.findPathHistogram = new MetricsHistogram({
          name: "findPath",
          help: "Path finding duration in milliseconds",
          registers: [metricsRegistry],
          buckets: exponentialBuckets(0.1, 2, 20), // 0.1ms to ~100s
        });
      }
    }
    return this.findPathHistogram;
  }

  protected init() {
    return new InstrumentationNodeModuleDefinition(
      "ngraph.path",
      [">=1.0.0"],
      (moduleExports: NgraphModule) => {
        this._wrap(moduleExports, "aStar", this.patchAstar.bind(this));
        return moduleExports;
      },
      (moduleExports: NgraphModule) => {
        this._unwrap(moduleExports, "aStar");
        return moduleExports;
      }
    );
  }

  private patchAstar(original: NgraphModule["aStar"]) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
    const instrumentation = this;
    return function wrappedAstar(graph: unknown, options: unknown): NgraphPathFinder {
      const pathFinder = original(graph, options);
      
      // Wrap the find method
      instrumentation._wrap(pathFinder, "find", instrumentation.patchFind.bind(instrumentation));
      
      return pathFinder;
    };
  }

  private patchFind(original: NgraphPathFinder["find"]) {
    const tracer = trace.getTracer("ngraph-path-instrumentation");
    // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
    const instrumentation = this;
    
    return function wrappedFind(this: unknown, fromId: string, toId: string): unknown[] | null {
      const span = tracer.startSpan("ngraph.path.find", {
        kind: SpanKind.INTERNAL,
        attributes: {
          "pathfinding.from_id": fromId,
          "pathfinding.to_id": toId,
          "pathfinding.algorithm": "a-star",
        },
      });

      const getMeasurement = beginMeasuringTimeSpan();

      return context.with(trace.setSpan(context.active(), span), () => {
        try {
          const result = original.call(this, fromId, toId);
          
          // Add result attributes
          if (Array.isArray(result)) {
            span.setAttributes({
              "pathfinding.path_length": result.length,
              "pathfinding.found": true,
            });
          } else {
            span.setAttributes({
              "pathfinding.found": false,
            });
          }
          
          span.setStatus({ code: SpanStatusCode.OK });
          
          // Record metrics if histogram is available
          const histogram = instrumentation.ensureHistogram();
          if (histogram) {
            const duration = getMeasurement();
            histogram.observe(duration.totalMilliseconds);
          }
          
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          
          // Still record metrics for failed operations
          const histogram = instrumentation.ensureHistogram();
          if (histogram) {
            const duration = getMeasurement();
            histogram.observe(duration.totalMilliseconds);
          }
          
          throw error;
        } finally {
          span.end();
        }
      });
    };
  }
}
