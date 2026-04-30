import { describe, it, expect } from "vitest";
import { RiftModule, inject, initializeModules } from "../src/index";

describe("initializeModules", () => {
  it("initializes modules in dependency order and tears down in reverse", async () => {
    const log: string[] = [];

    class Logger extends RiftModule {
      write(line: string): void {
        log.push(line);
      }
      init(): () => void {
        this.write("init:logger");
        return () => this.write("stop:logger");
      }
    }

    class Db extends RiftModule {
      @inject(Logger) accessor logger!: Logger;
      init(): () => void {
        this.logger.write("init:db");
        return () => this.logger.write("stop:db");
      }
    }

    class Server extends RiftModule {
      @inject(Db) accessor db!: Db;
      @inject(Logger) accessor logger!: Logger;
      init(): () => void {
        this.logger.write("init:server");
        return () => this.logger.write("stop:server");
      }
    }

    const cleanup = await initializeModules([
      new Server(),
      new Db(),
      new Logger(),
    ]);

    expect(log).toEqual(["init:logger", "init:db", "init:server"]);

    await cleanup();

    expect(log).toEqual([
      "init:logger",
      "init:db",
      "init:server",
      "stop:server",
      "stop:db",
      "stop:logger",
    ]);
  });

  it("awaits async inits sequentially in dependency order", async () => {
    const events: string[] = [];
    function delay(ms: number): Promise<void> {
      return new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    class A extends RiftModule {
      async init(): Promise<void> {
        events.push("a:start");
        await delay(10);
        events.push("a:end");
      }
    }

    class B extends RiftModule {
      @inject(A) accessor a!: A;
      async init(): Promise<void> {
        events.push("b:start");
        await delay(1);
        events.push("b:end");
      }
    }

    await initializeModules([new B(), new A()]);

    expect(events).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  it("injects non-RiftModule dependencies and skips their init sequence", async () => {
    class Config {
      readonly port = 8080;
    }

    class Server extends RiftModule {
      @inject(Config) accessor config!: Config;
      seenPort?: number;
      init(): void {
        this.seenPort = this.config.port;
      }
    }

    const config = new Config();
    const server = new Server();
    await initializeModules([server, config]);

    expect(server.config).toBe(config);
    expect(server.seenPort).toBe(8080);
  });

  it("rejects a missing dependency", async () => {
    class Missing {}
    class Needs extends RiftModule {
      @inject(Missing) accessor missing!: Missing;
      init(): void {}
    }

    await expect(initializeModules([new Needs()])).rejects.toThrow(
      /depends on "Missing"/,
    );
  });

  it("rejects duplicate instances of the same module class", async () => {
    class Dup extends RiftModule {
      init(): void {}
    }
    await expect(initializeModules([new Dup(), new Dup()])).rejects.toThrow(
      /Duplicate module/,
    );
  });

  it("runs cleanups even when some inits return nothing", async () => {
    const log: string[] = [];
    class Silent extends RiftModule {
      init(): void {
        log.push("silent");
      }
    }
    class Loud extends RiftModule {
      @inject(Silent) accessor silent!: Silent;
      init(): () => void {
        log.push("loud");
        return () => log.push("loud:stop");
      }
    }

    const cleanup = await initializeModules([new Loud(), new Silent()]);
    expect(log).toEqual(["silent", "loud"]);
    await cleanup();
    expect(log).toEqual(["silent", "loud", "loud:stop"]);
  });
});
