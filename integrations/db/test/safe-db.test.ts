import { describe, expect, it, vi } from "vitest";
import { ok } from "@mp/std";
import {
  safeDbOperation,
  safeDbOperationSync,
  toSafeDbOperation,
} from "../src/safe-db";
import { DbClient } from "../src/client";
import type { DrizzleClient } from "../src/client";

// Mock DrizzleClient
const mockDrizzleClient = {} as DrizzleClient;

describe("safeDbOperation", () => {
  it("returns Ok result when operation succeeds", async () => {
    const db = new DbClient(mockDrizzleClient);
    const result = await safeDbOperation(db, () => {
      return Promise.resolve({ id: 1, name: "test" });
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ id: 1, name: "test" });
    }
  });

  it("returns Err result when operation throws", async () => {
    const db = new DbClient(mockDrizzleClient);
    const error = new Error("Database error");
    const result = await safeDbOperation(db, () => {
      return Promise.reject(error);
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(error);
    }
  });

  it("wraps non-Error thrown values in Error", async () => {
    const db = new DbClient(mockDrizzleClient);
    const result = await safeDbOperation(db, () => {
      return Promise.reject("string error");
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("string error");
    }
  });

  it("unwraps DbClient correctly", async () => {
    const db = new DbClient(mockDrizzleClient);
    let unwrappedClient: DrizzleClient | undefined;

    await safeDbOperation(db, (drizzle) => {
      unwrappedClient = drizzle;
      return Promise.resolve("test");
    });

    expect(unwrappedClient).toBe(mockDrizzleClient);
  });
});

describe("safeDbOperationSync", () => {
  it("returns Ok result when operation succeeds", () => {
    const db = new DbClient(mockDrizzleClient);
    const result = safeDbOperationSync(db, () => {
      return { id: 1, name: "test" };
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ id: 1, name: "test" });
    }
  });

  it("returns Err result when operation throws", () => {
    const db = new DbClient(mockDrizzleClient);
    const error = new Error("Sync error");
    const result = safeDbOperationSync(db, () => {
      throw error;
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(error);
    }
  });

  it("wraps non-Error thrown values in Error", () => {
    const db = new DbClient(mockDrizzleClient);
    const result = safeDbOperationSync(db, () => {
      throw "string error";
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("string error");
    }
  });
});

describe("toSafeDbOperation", () => {
  it("returns Ok result when operation succeeds", async () => {
    const result = await toSafeDbOperation(() => {
      return Promise.resolve({ id: 1, name: "test" });
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ id: 1, name: "test" });
    }
  });

  it("returns Err result when operation throws", async () => {
    const error = new Error("Operation error");
    const result = await toSafeDbOperation(() => {
      return Promise.reject(error);
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(error);
    }
  });

  it("can be used to gradually migrate existing code", async () => {
    // Simulate an existing throwing function
    function legacyDbOperation() {
      return Promise.reject(new Error("Legacy error"));
    }

    const result = await toSafeDbOperation(legacyDbOperation);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Legacy error");
    }
  });
});

describe("Result type usage", () => {
  it("can be chained with map", async () => {
    const db = new DbClient(mockDrizzleClient);
    const result = await safeDbOperation(db, () => {
      return Promise.resolve({ id: 1, value: 10 });
    });

    const mapped = result.map((data) => data.value * 2);

    expect(mapped.isOk()).toBe(true);
    if (mapped.isOk()) {
      expect(mapped.value).toBe(20);
    }
  });

  it("can be chained with andThen", async () => {
    const db = new DbClient(mockDrizzleClient);
    const result = await safeDbOperation(db, () => {
      return Promise.resolve({ id: 1 });
    });

    const chained = result.andThen((data) => {
      if (data.id > 0) {
        return ok("valid");
      }
      return ok("invalid");
    });

    expect(chained.isOk()).toBe(true);
    if (chained.isOk()) {
      expect(chained.value).toBe("valid");
    }
  });

  it("short-circuits on error", async () => {
    const db = new DbClient(mockDrizzleClient);
    const result = await safeDbOperation(db, () => {
      return Promise.reject(new Error("Database error"));
    });

    const spy = vi.fn();
    const mapped = result.map(spy);

    expect(spy).not.toHaveBeenCalled();
    expect(mapped.isErr()).toBe(true);
  });
});
