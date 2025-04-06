import type { Branded } from "@mp/std";

export type ClientId = Branded<string, "ClientId">;

export { addExtension as addEncoderExtensionToSync } from "cbor-x";
