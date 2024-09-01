import type { CharacterId, ClientStateUpdate } from "@mp/server";
import {
  serialization,
  type ClientState,
  type ServerModules,
} from "@mp/server";
import { Client } from "@mp/network/client";
import { v4 as uuid } from "uuid";
import { env } from "./env";

export const api = new Client<ServerModules, ClientState, ClientStateUpdate>({
  url: env.serverUrl,
  createInitialState: () => ({ characters: new Map() }),
  parseStateUpdate: serialization.stateUpdate.parse,
  parseRPCOutput: serialization.rpc.parse,
  createNextState: (_, nextState) => nextState,
  serializeRPC: serialization.rpc.serialize,
  getAuth: () => ({ token: getMyFakeCharacterId() }),
});

export function getMyFakeCharacterId(): CharacterId {
  let existingId = localStorage.getItem("userId");
  if (!existingId) {
    existingId = uuid();
    localStorage.setItem("userId", existingId);
  }
  return existingId as CharacterId;
}
