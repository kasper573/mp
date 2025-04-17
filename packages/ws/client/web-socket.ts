import PartySocket from "partysocket/ws";

class ArrayBufferSocket extends PartySocket {
  constructor(...params: ConstructorParameters<typeof PartySocket>) {
    super(...params);
    this.binaryType = "arraybuffer";
  }
}

// PartySocket is functionally compatible with WebSocket, but doesn't match the typedef perfectly,
// so this assertion works around that. It should be safe to do so.
const MaskedAsWebSocket: WebSocketConstructor =
  ArrayBufferSocket as WebSocketConstructor;

export { MaskedAsWebSocket as WebSocket };

type WebSocketConstructor = typeof WebSocket;
