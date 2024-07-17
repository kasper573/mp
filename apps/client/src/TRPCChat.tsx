import { api } from "@mp/api-client/react";
import type { FormEvent } from "react";
import { useReducer, useState } from "react";
import { type Message } from "@mp/api-client/react";

export function TRPCChat() {
  const [input, setInput] = useState("");
  const [enabled, toggle] = useReducer((b) => !b, false);
  const [chatMessages, addChatMessage] = useReducer(
    (arr: Message[], msg: Message) => [...arr, msg],
    [],
  );
  const say = api.example.say.useMutation();

  api.example.chat.useSubscription(void 0, {
    enabled,
    onData: addChatMessage,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    say.mutate(input);
    setInput("");
  }

  return (
    <>
      <textarea readOnly value={renderChat(chatMessages)} cols={50} rows={10} />
      <form onSubmit={submit}>
        <label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
          />
        </label>
      </form>

      <button onClick={toggle}>
        {enabled ? "Disable subscription" : "Enable subscription"}
      </button>
    </>
  );
}

function renderChat(messages: Message[]): string {
  return messages.map((msg) => `${msg.from}: ${msg.contents}`).join("\n");
}
