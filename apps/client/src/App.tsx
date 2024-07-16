import { api } from "@mp/api-client/react";

export function App() {
  const query = api.example.greeting.useQuery("Hello there");
  return (
    <>
      <h1>Hello World</h1>
      <p>{query.data}</p>
    </>
  );
}
