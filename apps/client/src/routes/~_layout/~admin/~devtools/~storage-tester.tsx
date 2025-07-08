import { createReactiveStorage } from "@mp/state";
import { useStorage } from "@mp/state/solid";
import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/_layout/admin/devtools/storage-tester")({
  component: RouteComponent,
});

const storage = createReactiveStorage<{ text: string }>(
  localStorage,
  "test-storage",
  { text: "Initial value" },
);

function RouteComponent() {
  return (
    <>
      <h1>Storage Tester</h1>
      <p style={{ "max-width": "600px" }}>
        These two instances of the Storage Tester component share the same
        storage. When you change the text in one instance, it will update in the
        other instance as well. This demonstrates the reactive storage system in
        action.
      </p>
      <p style={{ "max-width": "600px" }}>
        The data is stored in localStorage and will persist across page reloads.
        You can also open the developer console and inspect the localStorage to
        see the changes in real-time.
      </p>
      <div style={{ display: "flex", "flex-direction": "row", gap: "20px" }}>
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
  const [storageValue, updateStorage] = useStorage(storage);

  const setText = (newText: string) => {
    updateStorage((prev) => ({ ...prev, text: newText }));
  };
  return (
    <>
      <input
        type="text"
        value={storageValue().text}
        onInput={(e) => setText(e.currentTarget.value)}
      />
      <h2>Storage value</h2>
      <pre>{JSON.stringify(storageValue(), null, 2)}</pre>
    </>
  );
}
