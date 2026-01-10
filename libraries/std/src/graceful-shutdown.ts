// oxlint-disable no-console
let isGracefulShutdownRegistered = false;

export function setupGracefulShutdown(
  process: NodeJS.Process,
  cleanupFns: Array<() => unknown>,
  forceExitTimeoutMs = 5_000,
) {
  if (isGracefulShutdownRegistered) {
    throw new Error("gracefulShutdown has already been registered");
  }

  isGracefulShutdownRegistered = true;
  let hasCalledCleanup = false;

  async function cleanup(exitCode: number) {
    if (hasCalledCleanup) {
      return;
    }

    hasCalledCleanup = true;

    const timeoutId = setTimeout(forceExit, forceExitTimeoutMs);
    const results = await Promise.allSettled(cleanupFns.map((fn) => fn()));
    clearTimeout(timeoutId);

    for (const result of results) {
      if (result.status === "rejected") {
        console.error(
          new Error("Error during cleanup", { cause: result.reason }),
        );
      }
    }

    function forceExit() {
      console.warn(
        `Graceful shutdown timed out after ${forceExitTimeoutMs}ms.`,
      );
      process.exit(exitCode);
    }

    process.exit(exitCode);
  }

  process.on("SIGINT", () => cleanup(0));
  process.on("SIGTERM", () => cleanup(0));
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    void cleanup(1);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
    void cleanup(1);
  });
  process.on("beforeExit", () => cleanup(0));
}
