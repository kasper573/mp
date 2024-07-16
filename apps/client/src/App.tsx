import { api } from "@mp/api-client/react";

export function App() {
  const query = api.example.greeting.useQuery("Client 3");
  const count = api.example.count.useQuery();
  const increment = api.example.increaseCount.useMutation();

  return (
    <>
      <h1>Hi Mom!</h1>
      <p>{query.data}</p>
      <p>Count: {count.data}</p>
      <button onClick={() => increment.mutate({ amount: 1 })}>Increment</button>
    </>
  );
}
