import { register } from "node:module";
import {
  NodeTracerProvider,
  Resource,
  registerInstrumentations,
  ATTR_SERVICE_VERSION,
  ATTR_SERVICE_NAME,
  BatchSpanProcessor,
  OTLPTraceExporter,
  W3CTraceContextPropagator,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  CompressionAlgorithm,
  getNodeAutoInstrumentations,
  WSInstrumentation,
  FsInstrumentation,
} from "@mp/telemetry/otel";
import { createAddHookMessageChannel } from "import-in-the-middle";

const { registerOptions, waitForAllMessagesAcknowledged } =
  createAddHookMessageChannel();

register("import-in-the-middle/hook.mjs", import.meta.url, registerOptions);

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

const tracerProvider = new NodeTracerProvider({
  resource: Resource.default().merge(
    new Resource({
      [ATTR_SERVICE_NAME]: "mp-server",
      [ATTR_SERVICE_VERSION]: process.env.MP_SERVER_BUILD_VERSION,
      "service.branch": process.env.MP_SERVER_BUILD_BRANCH,
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

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    ...getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-pg": { enhancedDatabaseReporting: true },
    }),
    new FsInstrumentation(),
    new WSInstrumentation({
      sendSpans: true,
      messageEvents: true,
    }),
  ],
});

await waitForAllMessagesAcknowledged();
