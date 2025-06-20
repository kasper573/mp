import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "@mp/std";
import type { RcpResponse } from "../src/transceiver";
import { RpcTransceiver } from "../src/transceiver";
import type { RpcCall, RpcCallId } from "../src/rpc-invoker";
import { RpcInvokerError } from "../src/rpc-invoker";

describe("RpcTransceiver", () => {
  let sendCall: ReturnType<typeof vi.fn>;
  let sendResponse: ReturnType<typeof vi.fn>;
  let transceiver: RpcTransceiver;

  beforeEach(() => {
    sendCall = vi.fn();
    sendResponse = vi.fn();
    transceiver = new RpcTransceiver({ sendCall, sendResponse });
  });

  describe("call()", () => {
    it("resolves immediately without waiting when requiresResponse returns false", async () => {
      const noRespTransceiver = new RpcTransceiver({
        sendCall,
        sendResponse,
        requiresResponse: () => false,
      });

      const result = await noRespTransceiver.call(["nr"], 42);
      expect(sendCall).toHaveBeenCalledOnce();
      // No need to call handleResponse; promise should resolve to undefined
      expect(result).toBeUndefined();
    });

    it("sends the call and resolves with output when requiresResponse returns true", async () => {
      const promise = transceiver.call(["method"], { foo: "bar" });
      expect(sendCall).toHaveBeenCalledOnce();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const [[path, input, id]] = sendCall.mock.calls[0];
      expect(path).toEqual(["method"]);
      expect(input).toEqual({ foo: "bar" });
      expect(id).toBe(0);

      // simulate response
      const response: RcpResponse<number> = [0 as RpcCallId, { output: 123 }];
      transceiver.handleResponse(response);

      await expect(promise).resolves.toBe(123);
    });

    it("throws if the response contains an error", async () => {
      const promise = transceiver.call(["m"], "input");
      transceiver.handleResponse([
        0 as RpcCallId,
        { error: new Error("oops") },
      ]);
      await expect(promise).rejects.toThrow("Remote responded with an error");
    });

    it("rejects with error on timeout", async () => {
      vi.useFakeTimers();
      const t = new RpcTransceiver({
        sendCall,
        sendResponse,
        timeout: 1000,
        requiresResponse: () => true,
      });

      const promise = t.call(["path"], null);
      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow("Remote responded with an error");
      vi.useRealTimers();
    });

    it("handles multiple simultaneous calls independently", async () => {
      const p1 = transceiver.call(["a"], 1);
      const p2 = transceiver.call(["b"], 2);
      expect(sendCall).toHaveBeenCalledTimes(2);

      transceiver.handleResponse([0 as RpcCallId, { output: "one" }]);
      transceiver.handleResponse([1 as RpcCallId, { output: "two" }]);

      await expect(p1).resolves.toBe("one");
      await expect(p2).resolves.toBe("two");
    });
  });

  describe("handleResponse()", () => {
    it("returns ok and resolves a pending call", async () => {
      const p = transceiver.call(["test"], "data");
      const result = transceiver.handleResponse([
        0 as RpcCallId,
        { output: "ok" },
      ]);
      expect(result.isOk()).toBe(true);
      await expect(p).resolves.toBe("ok");
    });

    it("returns err for an unknown callId", () => {
      const result = transceiver.handleResponse([
        999 as RpcCallId,
        { output: "unused" },
      ]);
      expect(result.isErr()).toBe(true);
      // @ts-expect-error ignore harmless error for lazy property accses
      expect(result.error).toBeInstanceOf(Error);
      // @ts-expect-error ignore harmless error for lazy property accses
      expect((result.error as Error).message).toContain("Unknown callId");
    });
  });

  describe("handleCall()", () => {
    const dummyCall: RpcCall<unknown> = [["path"], "input", 1 as RpcCallId];
    const dummyCtx = void 0;

    it("returns err and does not sendResponse when no invoke is provided", async () => {
      const result = await transceiver.handleCall(dummyCall, dummyCtx);
      expect(result.isErr()).toBe(true);
      // @ts-expect-error ignore harmless error for lazy property accses
      expect(result.error).toBeInstanceOf(RpcInvokerError);
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it("skips sendResponse when requiresResponse returns false", async () => {
      const invoke = vi.fn(() => Promise.resolve(ok("X")));
      const t = new RpcTransceiver({
        sendCall,
        sendResponse,
        invoke,
        requiresResponse: () => false,
      });

      const result = await t.handleCall(dummyCall, dummyCtx);
      expect(invoke).toHaveBeenCalledWith(dummyCall, dummyCtx);
      expect(result.isOk()).toBe(true);
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it("invokes and sends output on success when requiresResponse returns true", async () => {
      const invoke = vi.fn(() => Promise.resolve(ok("VALUE")));
      const t = new RpcTransceiver({
        sendCall,
        sendResponse,
        invoke,
        requiresResponse: () => true,
      });
      const call: RpcCall<unknown> = [["do"], 42, 7 as RpcCallId];

      const result = await t.handleCall(call, dummyCtx);

      expect(invoke).toHaveBeenCalledWith(call, dummyCtx);
      expect(result.isOk()).toBe(true);
      // @ts-expect-error ignore harmless error for lazy property accses
      expect(result.value).toBe("VALUE");
      expect(sendResponse).toHaveBeenCalledWith([
        7 as RpcCallId,
        { output: "VALUE" },
      ]);
    });

    it("invokes and sends formatted error on failure when requiresResponse returns true", async () => {
      const originalError = new Error("fail");
      const invoke = vi.fn(() => Promise.resolve(err(originalError)));
      const formatError = vi.fn(
        (e: unknown) => "formatted:" + (e as Error).message,
      );
      const t = new RpcTransceiver({
        sendCall,
        sendResponse,
        invoke,
        formatResponseError: formatError,
        requiresResponse: () => true,
      });
      const call: RpcCall<unknown> = [["do"], null, 5 as RpcCallId];

      const result = await t.handleCall(call, dummyCtx);

      expect(invoke).toHaveBeenCalledWith(call, dummyCtx);
      expect(formatError).toHaveBeenCalledWith(originalError);
      expect(result.isErr()).toBe(true);
      expect(sendResponse).toHaveBeenCalledWith([
        5 as RpcCallId,
        { error: "formatted:fail" },
      ]);
    });
  });
});
