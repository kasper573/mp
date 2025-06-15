import { writeFile } from "node:fs/promises";
import type { MetricsRegistry } from "@mp/telemetry/prom";
import type { Logger } from "@mp/logger";

/**
 * Service that writes metrics to a file periodically
 */
export class MetricsFileWriter {
  private isWriting = false;

  constructor(
    private readonly registry: MetricsRegistry,
    private readonly filePath: string,
    private readonly logger: Logger,
  ) {}

  /**
   * Write the current metrics to the file
   */
  async writeMetrics(): Promise<void> {
    if (this.isWriting) {
      // Use info level for less frequent logging
      return;
    }

    this.isWriting = true;
    try {
      const metricsData = await this.registry.metrics();
      await writeFile(this.filePath, metricsData, "utf8");
      // Only log successful writes occasionally to avoid spam
    } catch (error: unknown) {
      this.logger.error("Failed to write metrics file", {
        error: String(error),
        filePath: this.filePath,
      });
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Create a tick handler for periodic writes
   */
  createTickHandler() {
    return () => {
      this.writeMetrics().catch((error: unknown) => {
        this.logger.error("Metrics write tick handler failed", {
          error: String(error),
        });
      });
    };
  }
}
