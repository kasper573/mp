import * as v from "valibot";
import { err, ok, type Result } from "@mp/std";
import { VectorTiledMapSchema, type VectorTiledMap } from "./schema/vector-map";
import {
  VectorTiledObjectSchema,
  type VectorTiledObjectUnion,
} from "./schema/vector-objects";

/**
 * Valibot issue type
 */
export type ValidationIssue = v.BaseIssue<unknown>;

/**
 * Options for the Vector-based Tiled loader
 */
export interface VectorTiledLoaderOptions {
  /**
   * Function to load file content as JSON
   * @param path - The file path to load
   * @returns Promise resolving to the JSON data
   */
  loadFile: (path: string) => Promise<unknown>;

  /**
   * Base path for resolving relative file paths
   */
  basePath?: string;
}

/**
 * Error types for the Vector-based loader
 */
export type VectorTiledLoaderError =
  | { type: "file_not_found"; path: string }
  | { type: "invalid_json"; path: string; error: string }
  | { type: "validation_error"; path: string; issues: ValidationIssue[] }
  | { type: "unknown_error"; error: string };

/**
 * Create a Vector-based Tiled loader
 *
 * This loader parses real Tiled JSON format and transforms it to a Vector-based
 * data structure for better performance and developer experience.
 *
 * @param options - Configuration options for the loader
 * @returns A loader function that can load and transform Tiled maps
 */
export function createVectorTiledLoader(options: VectorTiledLoaderOptions) {
  const { loadFile, basePath = "" } = options;

  /**
   * Load and transform a Tiled map file
   *
   * @param path - Path to the Tiled map JSON file
   * @returns Result containing the transformed VectorTiledMap or an error
   */
  async function load(
    path: string,
  ): Promise<Result<VectorTiledMap, VectorTiledLoaderError>> {
    try {
      // Load the file
      const fullPath = basePath ? `${basePath}/${path}` : path;
      const data = await loadFile(fullPath);

      // Parse and transform the data
      const parseResult = v.safeParse(VectorTiledMapSchema, data);

      if (!parseResult.success) {
        return err({
          type: "validation_error",
          path: fullPath,
          issues: parseResult.issues,
        });
      }

      return ok(parseResult.output);
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.includes("not found") ||
          error.message.includes("ENOENT")
        ) {
          return err({
            type: "file_not_found",
            path,
          });
        }

        return err({
          type: "unknown_error",
          error: error.message,
        });
      }

      return err({
        type: "unknown_error",
        error: String(error),
      });
    }
  }

  /**
   * Load and transform a Tiled object
   *
   * @param data - Raw Tiled object data
   * @returns Result containing the transformed VectorTiledObject or an error
   */
  function loadObject(
    data: unknown,
  ): Result<VectorTiledObjectUnion, VectorTiledLoaderError> {
    const parseResult = v.safeParse(VectorTiledObjectSchema, data);

    if (!parseResult.success) {
      return err({
        type: "validation_error",
        path: "<object>",
        issues: parseResult.issues,
      });
    }

    return ok(parseResult.output);
  }

  return {
    load,
    loadObject,

    /**
     * Parse raw Tiled JSON data directly
     *
     * @param data - Raw Tiled map JSON data
     * @returns Result containing the transformed VectorTiledMap or an error
     */
    parse(data: unknown): Result<VectorTiledMap, VectorTiledLoaderError> {
      const parseResult = v.safeParse(VectorTiledMapSchema, data);

      if (!parseResult.success) {
        return err({
          type: "validation_error",
          path: "<data>",
          issues: parseResult.issues,
        });
      }

      return ok(parseResult.output);
    },
  };
}

/**
 * Utility function to format validation errors for debugging
 */
export function formatValidationError(error: VectorTiledLoaderError): string {
  if (error.type === "validation_error") {
    const issues = error.issues
      .map((issue: ValidationIssue) => {
        const path =
          "path" in issue && Array.isArray(issue.path)
            ? issue.path
                .map((p: unknown) => (p as { key: string }).key)
                .join(".")
            : "root";
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");

    return `Validation failed for ${error.path}:\n${issues}`;
  }

  switch (error.type) {
    case "file_not_found":
      return `File not found: ${error.path}`;
    case "invalid_json":
      return `Invalid JSON in ${error.path}: ${error.error}`;
    case "unknown_error":
      return `Unknown error: ${error.error}`;
    default:
      return `Unknown error type`;
  }
}
