import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  trace,
  context,
  SpanStatusCode,
  SpanKind,
} from "@mp/telemetry/otel";

export class NgraphPathInstrumentation extends InstrumentationBase {
  constructor() {
    super("@mp/ngraph-path-instrumentation", "1.0.0", {});
  }

  protected init() {
    return new InstrumentationNodeModuleDefinition(
      "ngraph.path",
      [">=1.0.0"],
      (moduleExports: any) => {
        this._wrap(moduleExports, "aStar", this._patchAStar.bind(this));
        return moduleExports;
      },
      (moduleExports: any) => {
        if (moduleExports) {
          this._unwrap(moduleExports, "aStar");
        }
        return moduleExports;
      }
    );
  }

  private _patchAStar(original: any) {
    const instrumentation = this;
    return function patchedAStar(this: any, graph: any, options: any) {
      const pathFinder = original.call(this, graph, options);
      
      // Wrap the find method
      instrumentation._wrap(pathFinder, "find", instrumentation._patchFind.bind(instrumentation));
      
      return pathFinder;
    };
  }

  private _patchFind(original: any) {
    const tracer = trace.getTracer("ngraph-path-instrumentation");
    
    return function patchedFind(this: any, fromId: string, toId: string) {
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
