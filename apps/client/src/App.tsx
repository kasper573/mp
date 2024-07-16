import { api } from "@mp/api-client/react";
import { useReducer, useState } from "react";
import { useDebounceValue } from "usehooks-ts";

export function App() {
  const [input, setInput] = useState("Client");
  const [debouncedInput] = useDebounceValue(input, 500);
  const query = api.example.greeting.useQuery(debouncedInput);
  const count = api.example.count.useQuery();
  const increment = api.example.increaseCount.useMutation();
  const [enabled, toggle] = useReducer((b) => !b, false);
  const [events, addEvent] = useReducer(
    (arr: unknown[], e: unknown) => [...arr, e],
    [],
  );

  api.example.onAdd.useSubscription(debouncedInput, {
    enabled,
    onData: addEvent,
  });

  return (
    <>
      <h1>Hi Mom!</h1>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
      />
      <p>{query.data}</p>
      <p>Count: {count.data}</p>

      <button onClick={() => increment.mutate({ amount: 1 })}>Increment</button>
      <pre style={{ maxHeight: 200, overflowY: "auto" }}>
        {JSON.stringify({ events }, null, 2)}
      </pre>
      <button onClick={toggle}>
        {enabled ? "Disable subscription" : "Enable subscription"}
      </button>
    </>
  );
}
