import PartySocket from "partysocket/ws";

export function createReconnectingWebSocket(
  ...params: ConstructorParameters<typeof PartySocket>
): WebSocket {
  const socket = new PartySocket(...params);
  socket.binaryType = "arraybuffer";

  // PartySocket is functionally compatible with WebSocket, but doesn't match the typedef perfectly,
  // so this assertion works around that. It should be safe to do so.
  return socket as WebSocket;
}
