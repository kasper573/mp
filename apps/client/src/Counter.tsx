import { api } from "@mp/api-client/react";

export function Counter() {
  const count = api.example.count.useQuery();
  const increment = api.example.increaseCount.useMutation();

  return (
    <>
      <p>Count: {count.data}</p>
      <button onClick={() => increment.mutate({ amount: 1 })}>Increment</button>
    </>
  );
}
