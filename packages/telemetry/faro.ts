export {
  initializeFaro,
  isError,
  LogLevel,
  type Faro,
  type MetaUser as FaroUser,
  getWebInstrumentations,
  type OTELApi,
} from "@grafana/faro-web-sdk";
export { TracingInstrumentation } from "@grafana/faro-web-tracing";
export { SpanStatusCode } from "@opentelemetry/api";
export * from "./faroLogger";
