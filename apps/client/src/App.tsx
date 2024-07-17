import { Counter } from "./Counter";
import { TRPCChat } from "./TRPCChat";

export function App() {
  return (
    <>
      <h1>Counter</h1>
      <Counter />
      <h1>TRPC Chat</h1>
      <TRPCChat />
    </>
  );
}
