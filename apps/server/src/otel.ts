import { register } from "node:module";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  BatchSpanProcessor,
  CompressionAlgorithm,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  FsInstrumentation,
  getNodeAutoInstrumentations,
  NodeTracerProvider,
  OTLPTraceExporter,
  registerInstrumentations,
  Resource,
  W3CTraceContextPropagator,
  WSInstrumentation,
} from "../../../packages/telemetry/otel/mod";
import { createAddHookMessageChannel } from "import-in-the-middle";
const { registerOptions, waitForAllMessagesAcknowledged } =
  createAddHookMessageChannel();

register(
  "import-in-the-middle/hook.mjs",
  import.meta.url,
  // @ts-expect-error typedefs seems to be wrong, things work fine if we ignore the error
  registerOptions,
);

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

registerInstrumentations({
  tracerProvider,
  instrumentations: [
    ...getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-pg": { enhancedDatabaseReporting: true },
    }),
    new FsInstrumentation(),
    new WSInstrumentation(),
  ],
});

await waitForAllMessagesAcknowledged();
