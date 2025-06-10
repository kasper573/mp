import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  trace,
  context,
  SpanStatusCode,
  SpanKind,
} from "@mp/telemetry/otel";

type NgraphModule = {
  aStar: (graph: unknown, options: unknown) => NgraphPathFinder;
};

type NgraphPathFinder = {
  find: (fromId: string, toId: string) => unknown[] | null;
};

export class NgraphPathInstrumentation extends InstrumentationBase {
  constructor() {
    super("@mp/ngraph-path-instrumentation", "1.0.0", {});
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
    
    return function wrappedFind(fromId: string, toId: string): unknown[] | null {
      const span = tracer.startSpan("ngraph.path.find", {
        kind: SpanKind.INTERNAL,
        attributes: {
          "pathfinding.from_id": fromId,
          "pathfinding.to_id": toId,
          "pathfinding.algorithm": "a-star",
        },
      });

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
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          throw error;
        } finally {
          span.end();
        }
      });
    };
  }
}
