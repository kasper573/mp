import type http from "node:http";

export function handshakeDataFromRequest(
  req: http.IncomingMessage,
): HandshakeData {
  const url = new URL(req.url!, "http://localhost"); // .url is in fact a path, so baseUrl does not matter
  return { token: url.searchParams.get("token") ?? undefined };
}

export function createUrlWithHandshakeData(
  syncServerUrl: string,
  handshake: HandshakeData,
): string {
  const url = new URL(syncServerUrl);
  if (handshake.token) {
    url.searchParams.set("token", handshake.token);
  }
  return url.toString();
}

export interface HandshakeData {
  token?: string;
}
