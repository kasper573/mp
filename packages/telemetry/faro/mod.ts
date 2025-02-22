export {
  type Faro,
  getWebInstrumentations,
  initializeFaro,
  isError,
  LogLevel,
  type MetaUser as FaroUser,
  type OTELApi,
} from "@grafana/faro-web-sdk";
export { TracingInstrumentation } from "@grafana/faro-web-tracing";
export * from "./faroLogger";
