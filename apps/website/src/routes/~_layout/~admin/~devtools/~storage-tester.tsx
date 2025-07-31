import { StorageSignal } from "@mp/state";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/admin/devtools/storage-tester")({
  component: RouteComponent,
});

const storage = new StorageSignal<{ text: string }>("local", "test-storage", {
  text: "Initial value",
});

function RouteComponent() {
  return (
    <>
      <h1>Storage Tester</h1>
      <p style={{ maxWidth: "600px" }}>
        These two instances of the Storage Tester component share the same
        storage. When you change the text in one instance, it will update in the
        other instance as well. This demonstrates the reactive storage system in
        action.
      </p>
      <p style={{ maxWidth: "600px" }}>
        The data is stored in localStorage and will persist across page reloads.
        You can also open the developer console and inspect the localStorage to
        see the changes in real-time.
      </p>
      <div style={{ display: "flex", flexDirection: "row", gap: "20px" }}>
        <div style={{ flex: 1 }}>
          <h2>Storage Tester instance 1</h2>
          <StorageTester />
        </div>
        <div style={{ flex: 1 }}>
          <h2>Storage Tester instance 2</h2>
          <StorageTester />
        </div>
      </div>
    </>
  );
}

function StorageTester() {
  const setText = (newText: string) => {
    storage.value = { ...storage.value, text: newText };
  };
  return (
    <>
      <input
        type="text"
        value={storage.value.text}
        onInput={(e) => setText(e.currentTarget.value)}
      />
      <h2>Storage value</h2>
      <pre>{JSON.stringify(storage.value, null, 2)}</pre>
    </>
  );
}
