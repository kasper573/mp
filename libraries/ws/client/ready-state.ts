/**
 * Convenience function to subscribe to the WebSocket readyState changes.
 */
export function subscribeToReadyState<ReadyState extends number>(
  socket: Pick<WebSocket, "addEventListener" | "removeEventListener"> & {
    readyState: ReadyState;
  },
  onReadyStateChanged: (readyState: ReadyState) => unknown,
) {
  const updateReadyState = () => onReadyStateChanged(socket.readyState);
  socket.addEventListener("open", updateReadyState);
  socket.addEventListener("close", updateReadyState);
  socket.addEventListener("error", updateReadyState);
  updateReadyState();
  return function cleanup() {
    socket.removeEventListener("open", updateReadyState);
    socket.removeEventListener("close", updateReadyState);
    socket.removeEventListener("error", updateReadyState);
  };
}
