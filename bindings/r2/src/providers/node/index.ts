import { createHash } from "node:crypto";
import path from "node:path";
import {
  defineService,
  type ServiceDefinition,
} from "../../../../../src/env.js";
import { R2Bucket } from "../../binding.js";
import type { R2Service } from "../../service.js";
import {
  FileSystemR2Service,
  type FileSystemR2ServiceOptions,
} from "./filesystem.js";

export { FileSystemR2Service } from "./filesystem.js";
export type { FileSystemR2ServiceOptions } from "./filesystem.js";

export interface FileSystemServiceOptions {
  /**
   * Provider-managed bucket directory. Defaults to
   * <cwd>/.sourdough/r2/<binding-name>.
   */
  storageDir?: string;
}

/** Defines the first-party Node.js filesystem service for an env R2 binding. */
export function fileSystem(
  options: FileSystemServiceOptions = {},
): ServiceDefinition<R2Service> {
  return defineService(({ bindingName }) =>
    new FileSystemR2Service({
      root: path.resolve(
        options.storageDir ??
          path.join(process.cwd(), ".sourdough", "r2", safeSegment(bindingName)),
      ),
    }),
  );
}

/** Low-level constructor for consumers that do not use defineEnv. */
export function createFileSystemR2Bucket(
  options: FileSystemR2ServiceOptions | string,
): R2Bucket {
  return new R2Bucket(new FileSystemR2Service(options));
}

function safeSegment(bindingName: string): string {
  return /^[A-Za-z0-9_-]+$/.test(bindingName)
    ? bindingName
    : createHash("sha256").update(bindingName).digest("hex");
}
