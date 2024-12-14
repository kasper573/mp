import {
  cbor as cborHelpers,
  NetworkAdapter,
  type PeerId,
  type PeerMetadata,
} from "@automerge/automerge-repo/slim";
import type {
  FromClientMessage,
  FromServerMessage,
  JoinMessage,
} from "@automerge/automerge-repo-network-websocket";
import {
  ProtocolV1,
  type ProtocolVersion,
} from "@automerge/automerge-repo-network-websocket";

const { encode, decode } = cborHelpers;

/**
 * A web standards WebSocket compatible server adapter for automerge
 */
export class WSServerAdapter extends NetworkAdapter {
  sockets: Map<PeerId, WebSocket> = new Map();

  #ready = false;
  #readyResolver?: () => void;
  #readyPromise = new Promise<void>((resolve) => {
    this.#readyResolver = resolve;
  });

  isReady(): boolean {
    return this.#ready;
  }

  whenReady(): Promise<void> {
    return this.#readyPromise;
  }

  #forceReady() {
    if (!this.#ready) {
      this.#ready = true;
      this.#readyResolver?.();
    }
  }

  connect(peerId: PeerId, peerMetadata?: PeerMetadata) {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
  }

  addSocket(socket: WebSocket) {
    // When a socket closes, or disconnects, remove it from our list
    socket.addEventListener("close", () => {
      this.removeSocket(socket);
    });

    socket.addEventListener(
      "message",
      (message) => this.receiveMessage(new Uint8Array(message.data), socket),
    );

    this.#forceReady();
  }

  disconnect() {
    this.sockets.forEach((socket) => {
      this.#terminate(socket);
      this.removeSocket(socket);
    });
  }

  send(message: FromServerMessage) {
    if ("data" in message && message.data?.byteLength === 0) {
      throw new Error("Tried to send a zero-length message");
    }

    const socket = this.sockets.get(message.targetId);

    if (!socket) {
      return;
    }

    const encoded = encode(message);
    const arrayBuf = toArrayBuffer(encoded);

    socket.send(arrayBuf);
  }

  receiveMessage(messageBytes: Uint8Array, socket: WebSocket) {
    let message: FromClientMessage;
    try {
      message = decode(messageBytes);
    } catch {
      socket.close();
      return;
    }

    const { senderId } = message;

    if (isJoinMessage(message)) {
      const { peerMetadata, supportedProtocolVersions } = message;
      const existingSocket = this.sockets.get(senderId);
      if (existingSocket) {
        if (existingSocket.readyState === WebSocket.OPEN) {
          existingSocket.close();
        }
        this.emit("peer-disconnected", { peerId: senderId });
      }

      // Let the repo know that we have a new connection.
      this.emit("peer-candidate", { peerId: senderId, peerMetadata });
      this.sockets.set(senderId, socket);

      const selectedProtocolVersion = selectProtocol(supportedProtocolVersions);
      if (selectedProtocolVersion === null) {
        this.send({
          type: "error",
          senderId: this.peerId!,
          message: "unsupported protocol version",
          targetId: senderId,
        });
        this.sockets.get(senderId)?.close();
        this.sockets.delete(senderId);
      } else {
        this.send({
          type: "peer",
          senderId: this.peerId!,
          peerMetadata: this.peerMetadata!,
          selectedProtocolVersion: ProtocolV1,
          targetId: senderId,
        });
      }
    } else {
      this.emit("message", message);
    }
  }

  #terminate(socket: WebSocket) {
    this.removeSocket(socket);
    socket.close();
  }

  removeSocket(socket: WebSocket) {
    const peerId = this.#peerIdBySocket(socket);
    if (!peerId) return;
    this.emit("peer-disconnected", { peerId });
    this.sockets.delete(peerId as PeerId);
  }

  #peerIdBySocket = (socket: WebSocket): PeerId | null => {
    for (const [peerId, candidate] of this.sockets) {
      if (candidate === socket) {
        return peerId;
      }
    }
    return null;
  };
}

const selectProtocol = (versions?: ProtocolVersion[]) => {
  if (versions === undefined) return ProtocolV1;
  if (versions.includes(ProtocolV1)) return ProtocolV1;
  return null;
};

/**
 * This incantation deals with websocket sending the whole underlying buffer even if we just have a
 * uint8array view on it
 */
const toArrayBuffer = (bytes: Uint8Array) => {
  const { buffer, byteOffset, byteLength } = bytes;
  return buffer.slice(byteOffset, byteOffset + byteLength);
};

const isJoinMessage = (
  message: FromClientMessage,
): message is JoinMessage => message.type === "join";
