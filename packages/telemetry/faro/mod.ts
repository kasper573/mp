export {
  type Faro,
  getWebInstrumentations,
  initializeFaro,
  isError,
  LogLevel,
  type MetaUser as FaroUser,
  type OTELApi,
} from "npm:@grafana/faro-web-sdk";
export { TracingInstrumentation } from "npm:@grafana/faro-web-tracing";
export * from "./faroLogger.ts";
