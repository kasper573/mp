import { useRendererContext } from "./hooks";

export function ChatLog() {
  const ctx = useRendererContext();
  return (
    <div>
      <div>Chat</div>
      <ul>
        {ctx.chatLines.value.map((line, i) => (
          <li key={i}>
            {line.fromEntityId}: {line.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
