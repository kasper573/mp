import { api } from "@mp/api-client/react";
import type { FormEvent } from "react";
import { useReducer, useState } from "react";
import { type Message } from "@mp/api-client/react";

export function App() {
  const [input, setInput] = useState("");
  const query = api.example.greeting.useQuery("Client");
  const count = api.example.count.useQuery();
  const increment = api.example.increaseCount.useMutation();
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
      <h1>Hi Mom!</h1>
      <p>{query.data}</p>

      <h2>Counter</h2>

      <p>Count: {count.data}</p>
      <button onClick={() => increment.mutate({ amount: 1 })}>Increment</button>

      <h2>Chat</h2>

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
