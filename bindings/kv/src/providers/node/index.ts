import { createHash } from "node:crypto";
import path from "node:path";

import { defineService, type ServiceDefinition } from "../../../../../src/env.js";
import { KVNamespace } from "../../binding.js";
import type { KVService } from "../../service.js";
import { SQLiteKVService, type SQLiteKVServiceOptions } from "./sqlite.js";

export { SQLiteKVService } from "./sqlite.js";
export type { SQLiteKVServiceOptions } from "./sqlite.js";

export interface KvSqliteProviderOptions {
  /**
   * Provider-managed namespace directory. Defaults to
   * <cwd>/.sourdough/kv/<binding-name>.
   */
  root?: string;
}

/** Defines the first-party Node.js SQLite service for an env KV binding. Tier 0 / single-namespace provider of record on Node. */
export function sqlite(
  options: KvSqliteProviderOptions = {},
): ServiceDefinition<KVService> {
  return defineService(({ bindingName }) =>
    new SQLiteKVService({
      root: path.resolve(
        options.root ??
          path.join(process.cwd(), ".sourdough", "kv", safeSegment(bindingName)),
      ),
    }),
  );
}

/** Low-level constructor for consumers that do not use defineEnv. */
export function createSQLiteKVNamespace(
  options: SQLiteKVServiceOptions | string,
): KVNamespace {
  return new KVNamespace(new SQLiteKVService(options));
}

function safeSegment(bindingName: string): string {
  return /^[A-Za-z0-9_-]+$/.test(bindingName)
    ? bindingName
    : createHash("sha256").update(bindingName).digest("hex");
}