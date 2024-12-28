import {
  NodeTracerProvider,
  Resource,
  registerInstrumentations,
  PgInstrumentation,
  ATTR_SERVICE_VERSION,
  ATTR_SERVICE_NAME,
  BatchSpanProcessor,
  OTLPTraceExporter,
  W3CTraceContextPropagator,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  CompressionAlgorithm,
  FsInstrumentation,
  UndiciInstrumentation,
  ExpressInstrumentation,
  HttpInstrumentation,
} from "@mp/telemetry/otel";

// NOTE: due to the nature of opentelemetry being built around
// monkey patching this file must be imported before anything else in the codebase.

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

const tracerProvider = new NodeTracerProvider({
  resource: Resource.default().merge(
    new Resource({
      [ATTR_SERVICE_NAME]: "mp-server",
      [ATTR_SERVICE_VERSION]: process.env.MP_SERVER_BUILD_VERSION,
    }),
  ),
});

tracerProvider.addSpanProcessor(
  new BatchSpanProcessor(
    new OTLPTraceExporter({
      compression: CompressionAlgorithm.GZIP,
      url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    }),
  ),
);

tracerProvider.register({
  propagator: new W3CTraceContextPropagator(),
});

const instrumentations = [
  new ExpressInstrumentation(),
  new HttpInstrumentation(),
  new PgInstrumentation(),
  new UndiciInstrumentation(),
  new FsInstrumentation(),
];

registerInstrumentations({
  tracerProvider,
  instrumentations,
});
