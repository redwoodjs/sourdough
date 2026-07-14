import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  type ReadStream,
} from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  R2Service,
  R2ServiceGetOptions,
  R2ServiceGetResult,
  R2ServiceListOptions,
  R2ServiceListResult,
  R2ServiceMultipartOptions,
  R2ServiceMultipartUpload,
  R2ServicePutOptions,
} from "../../service.js";
import {
  R2Error,
  checksumAlgorithms,
  type R2ChecksumAlgorithm,
  type R2Conditional,
  type R2HTTPMetadata,
  type R2ObjectData,
  type R2Range,
  type R2UploadedPart,
} from "../../types.js";

export interface FileSystemR2ServiceOptions {
  root: string;
}

interface StoredObject {
  key: string;
  version: string;
  size: number;
  etag: string;
  uploaded: string;
  checksums: Partial<Record<R2ChecksumAlgorithm, string>>;
  httpMetadata?: Omit<R2HTTPMetadata, "cacheExpiry"> & { cacheExpiry?: string };
  customMetadata?: Record<string, string>;
  storageClass: string;
  dataFile: string;
}

interface StoredMultipartUpload {
  key: string;
  uploadId: string;
  created: string;
  options: {
    httpMetadata?: StoredObject["httpMetadata"];
    customMetadata?: Record<string, string>;
    storageClass?: string;
  };
}

interface StoredPart {
  partNumber: number;
  etag: string;
  size: number;
  dataFile: string;
}

interface WrittenBody {
  size: number;
  checksums: Partial<Record<R2ChecksumAlgorithm, Uint8Array>>;
}

/**
 * First-party Node.js R2 provider backed by a filesystem directory.
 *
 * Object keys are hashed before they become paths, preventing traversal and
 * allowing arbitrary Unicode keys. Each write creates an immutable data file
 * and atomically swaps a metadata pointer to make replacement visible.
 */
export class FileSystemR2Service implements R2Service {
  readonly #objectsDirectory: string;
  readonly #multipartDirectory: string;
  readonly #ready: Promise<void>;
  readonly #locks = new Map<string, Promise<void>>();

  constructor(options: FileSystemR2ServiceOptions | string) {
    const root = path.resolve(typeof options === "string" ? options : options.root);
    this.#objectsDirectory = path.join(root, "objects");
    this.#multipartDirectory = path.join(root, "multipart");
    this.#ready = Promise.all([
      mkdir(this.#objectsDirectory, { recursive: true }),
      mkdir(this.#multipartDirectory, { recursive: true }),
    ]).then(() => undefined);
  }

  async head(key: string): Promise<R2ObjectData | null> {
    await this.#ready;
    const stored = await this.#readObject(key);
    return stored ? fromStoredObject(stored) : null;
  }

  async get(
    key: string,
    options: R2ServiceGetOptions = {},
  ): Promise<R2ServiceGetResult | null> {
    await this.#ready;
    assertNoSsec(options.ssecKey);
    const stored = await this.#readObject(key);
    if (!stored) return null;

    const object = fromStoredObject(stored);
    if (!conditionMatches(object, options.onlyIf)) {
      return { object, conditionFailed: true };
    }

    const resolvedRange = resolveRange(stored.size, options.range);
    const body = resolvedRange?.length === 0
      ? emptyWebStream()
      : toWebStream(
          createReadStream(path.join(this.#objectsDirectory, stored.dataFile), {
            ...(resolvedRange
              ? {
                  start: resolvedRange.offset,
                  end: resolvedRange.offset + resolvedRange.length - 1,
                }
              : {}),
          }),
        );

    return {
      object: {
        ...object,
        ...(resolvedRange ? { range: resolvedRange } : {}),
      },
      body,
    };
  }

  async put(
    key: string,
    body: ReadableStream<Uint8Array>,
    options: R2ServicePutOptions = {},
  ): Promise<R2ObjectData | null> {
    await this.#ready;
    assertNoSsec(options.ssecKey);
    return this.#withKeyLock(key, async () => {
      const previous = await this.#readObject(key);
      if (!conditionMatches(previous ? fromStoredObject(previous) : null, options.onlyIf)) {
        return null;
      }

      const version = randomUUID();
      const keyHash = hashKey(key);
      const dataFile = `${keyHash}.${version}.data`;
      const finalDataPath = path.join(this.#objectsDirectory, dataFile);
      const temporaryDataPath = `${finalDataPath}.${randomUUID()}.tmp`;

      let written: WrittenBody;
      try {
        written = await writeBody(
          body,
          temporaryDataPath,
          Object.keys(options.expectedChecksums ?? {}) as R2ChecksumAlgorithm[],
        );
        validateChecksums(written.checksums, options.expectedChecksums);
        await rename(temporaryDataPath, finalDataPath);
      } catch (error) {
        await rm(temporaryDataPath, { force: true });
        throw error;
      }

      const stored: StoredObject = {
        key,
        version,
        size: written.size,
        etag: toHex(written.checksums.md5!),
        uploaded: new Date().toISOString(),
        checksums: encodeChecksums(written.checksums),
        httpMetadata: serializeHttpMetadata(options.httpMetadata),
        customMetadata: options.customMetadata ? { ...options.customMetadata } : undefined,
        storageClass: options.storageClass ?? "Standard",
        dataFile,
      };

      try {
        await this.#writeMetadata(stored);
      } catch (error) {
        await rm(finalDataPath, { force: true });
        throw error;
      }

      if (previous && previous.dataFile !== dataFile) {
        await rm(path.join(this.#objectsDirectory, previous.dataFile), { force: true });
      }
      return fromStoredObject(stored);
    });
  }

  async delete(keys: string | string[]): Promise<void> {
    await this.#ready;
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      await this.#withKeyLock(key, async () => {
        const stored = await this.#readObject(key);
        await rm(this.#metadataPath(key), { force: true });
        if (stored) {
          await rm(path.join(this.#objectsDirectory, stored.dataFile), { force: true });
        }
      });
    }
  }

  async list(options: R2ServiceListOptions = {}): Promise<R2ServiceListResult> {
    await this.#ready;
    const storedObjects = await this.#readAllObjects();
    const prefix = options.prefix ?? "";
    const entries = new Map<
      string,
      { type: "object"; object: StoredObject } | { type: "prefix" }
    >();

    for (const object of storedObjects) {
      if (!object.key.startsWith(prefix)) continue;
      if (options.startAfter && object.key <= options.startAfter) continue;

      if (options.delimiter) {
        const remainder = object.key.slice(prefix.length);
        const delimiterIndex = remainder.indexOf(options.delimiter);
        if (delimiterIndex >= 0) {
          const delimitedPrefix =
            prefix + remainder.slice(0, delimiterIndex + options.delimiter.length);
          entries.set(delimitedPrefix, { type: "prefix" });
          continue;
        }
      }
      entries.set(object.key, { type: "object", object });
    }

    const sorted = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b));
    const offset = decodeCursor(options.cursor);
    const limit = Math.min(Math.max(options.limit ?? 1000, 1), 1000);
    const page = sorted.slice(offset, offset + limit);
    const truncated = offset + page.length < sorted.length;
    const objects: R2ObjectData[] = [];
    const delimitedPrefixes: string[] = [];

    for (const [name, entry] of page) {
      if (entry.type === "prefix") {
        delimitedPrefixes.push(name);
      } else {
        const object = fromStoredObject(entry.object);
        if (!options.include?.includes("httpMetadata")) delete object.httpMetadata;
        if (!options.include?.includes("customMetadata")) delete object.customMetadata;
        objects.push(object);
      }
    }

    return {
      objects,
      delimitedPrefixes,
      truncated,
      ...(truncated ? { cursor: encodeCursor(offset + page.length) } : {}),
    };
  }

  async createMultipartUpload(
    key: string,
    options: R2ServiceMultipartOptions = {},
  ): Promise<R2ServiceMultipartUpload> {
    await this.#ready;
    assertNoSsec(options.ssecKey);
    const uploadId = randomUUID();
    const directory = this.#uploadDirectory(uploadId);
    await mkdir(directory, { recursive: false });
    const upload: StoredMultipartUpload = {
      key,
      uploadId,
      created: new Date().toISOString(),
      options: {
        httpMetadata: serializeHttpMetadata(options.httpMetadata),
        customMetadata: options.customMetadata ? { ...options.customMetadata } : undefined,
        storageClass: options.storageClass,
      },
    };
    await writeFile(path.join(directory, "upload.json"), JSON.stringify(upload));
    return { key, uploadId };
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: ReadableStream<Uint8Array>,
    options: { ssecKey?: Uint8Array } = {},
  ): Promise<R2UploadedPart> {
    await this.#ready;
    assertNoSsec(options.ssecKey);
    await this.#readUpload(key, uploadId);
    const directory = this.#uploadDirectory(uploadId);
    const dataFile = `${partNumber}.${randomUUID()}.part`;
    const finalPath = path.join(directory, dataFile);
    const temporaryPath = `${finalPath}.tmp`;
    let written: WrittenBody;
    try {
      written = await writeBody(body, temporaryPath, []);
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
    const part: StoredPart = {
      partNumber,
      etag: toHex(written.checksums.md5!),
      size: written.size,
      dataFile,
    };
    const metadataPath = path.join(directory, `${partNumber}.json`);
    const previous = await readJson<StoredPart>(metadataPath);
    await writeJsonAtomic(metadataPath, part);
    if (previous && previous.dataFile !== dataFile) {
      await rm(path.join(directory, previous.dataFile), { force: true });
    }
    return { partNumber, etag: part.etag };
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.#ready;
    await this.#readUpload(key, uploadId);
    await rm(this.#uploadDirectory(uploadId), { recursive: true, force: true });
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    uploadedParts: R2UploadedPart[],
  ): Promise<R2ObjectData> {
    await this.#ready;
    const upload = await this.#readUpload(key, uploadId);
    if (uploadedParts.length === 0) {
      throw new R2Error("At least one uploaded part is required", {
        action: "completeMultipartUpload",
      });
    }

    const partNumbers = new Set<number>();
    const parts: StoredPart[] = [];
    for (const requested of uploadedParts) {
      if (partNumbers.has(requested.partNumber)) {
        throw new R2Error(`Duplicate multipart part ${requested.partNumber}`, {
          action: "completeMultipartUpload",
        });
      }
      partNumbers.add(requested.partNumber);
      const part = await readJson<StoredPart>(
        path.join(this.#uploadDirectory(uploadId), `${requested.partNumber}.json`),
      );
      if (!part || part.etag !== stripEtag(requested.etag)) {
        throw new R2Error(`Multipart part ${requested.partNumber} does not match`, {
          action: "completeMultipartUpload",
        });
      }
      parts.push(part);
    }
    parts.sort((a, b) => a.partNumber - b.partNumber);

    const body = toWebStream(
      Readable.from(
        (async function* (directory: string) {
          for (const part of parts) {
            for await (const chunk of createReadStream(path.join(directory, part.dataFile))) {
              yield chunk;
            }
          }
        })(this.#uploadDirectory(uploadId)),
      ),
    );
    const object = await this.put(key, body, {
      ...upload.options,
      httpMetadata: deserializeHttpMetadata(upload.options.httpMetadata),
    });
    if (!object) {
      throw new R2Error("Multipart completion condition failed", {
        action: "completeMultipartUpload",
      });
    }
    await rm(this.#uploadDirectory(uploadId), { recursive: true, force: true });
    return object;
  }

  async #readObject(key: string): Promise<StoredObject | null> {
    const object = await readJson<StoredObject>(this.#metadataPath(key));
    return object?.key === key ? object : null;
  }

  async #readAllObjects(): Promise<StoredObject[]> {
    const files = await readdir(this.#objectsDirectory);
    const objects = await Promise.all(
      files
        .filter(file => file.endsWith(".json"))
        .map(file => readJson<StoredObject>(path.join(this.#objectsDirectory, file))),
    );
    return objects.filter((object): object is StoredObject => object !== null);
  }

  async #writeMetadata(object: StoredObject): Promise<void> {
    await writeJsonAtomic(this.#metadataPath(object.key), object);
  }

  #metadataPath(key: string): string {
    return path.join(this.#objectsDirectory, `${hashKey(key)}.json`);
  }

  #uploadDirectory(uploadId: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) {
      throw new R2Error("Invalid multipart upload ID", { action: "multipart" });
    }
    return path.join(this.#multipartDirectory, uploadId);
  }

  async #readUpload(key: string, uploadId: string): Promise<StoredMultipartUpload> {
    const upload = await readJson<StoredMultipartUpload>(
      path.join(this.#uploadDirectory(uploadId), "upload.json"),
    );
    if (!upload || upload.key !== key || upload.uploadId !== uploadId) {
      throw new R2Error("Multipart upload does not exist", { action: "multipart" });
    }
    return upload;
  }

  async #withKeyLock<T>(key: string, callback: () => Promise<T>): Promise<T> {
    const previous = this.#locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const queued = previous.then(() => gate);
    this.#locks.set(key, queued);
    await previous;
    try {
      return await callback();
    } finally {
      release();
      if (this.#locks.get(key) === queued) this.#locks.delete(key);
    }
  }
}

async function writeBody(
  body: ReadableStream<Uint8Array>,
  outputPath: string,
  additionalAlgorithms: R2ChecksumAlgorithm[],
): Promise<WrittenBody> {
  const algorithms = new Set<R2ChecksumAlgorithm>(["md5", ...additionalAlgorithms]);
  const hashes = new Map(
    [...algorithms].map(algorithm => [algorithm, createHash(algorithm)] as const),
  );
  let size = 0;
  const hashingStream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.byteLength;
      for (const hash of hashes.values()) hash.update(bytes);
      callback(null, bytes);
    },
  });
  await pipeline(
    Readable.fromWeb(body as any),
    hashingStream,
    createWriteStream(outputPath, { flags: "wx" }),
  );
  return {
    size,
    checksums: Object.fromEntries(
      [...hashes].map(([algorithm, hash]) => [algorithm, new Uint8Array(hash.digest())]),
    ),
  };
}

function conditionMatches(
  object: R2ObjectData | null,
  condition?: R2Conditional,
): boolean {
  if (!condition) return true;
  if (condition.etagMatches) {
    if (!object) return false;
    if (condition.etagMatches !== "*" && object.etag !== stripEtag(condition.etagMatches)) {
      return false;
    }
  }
  if (condition.etagDoesNotMatch) {
    if (
      object &&
      (condition.etagDoesNotMatch === "*" ||
        object.etag === stripEtag(condition.etagDoesNotMatch))
    ) {
      return false;
    }
  }
  if (object && condition.uploadedBefore) {
    if (compareTime(object.uploaded, condition.uploadedBefore, condition.secondsGranularity) >= 0) {
      return false;
    }
  }
  if (object && condition.uploadedAfter) {
    if (compareTime(object.uploaded, condition.uploadedAfter, condition.secondsGranularity) <= 0) {
      return false;
    }
  }
  return true;
}

function compareTime(a: Date, b: Date, secondsGranularity = false): number {
  const aTime = secondsGranularity ? Math.floor(a.getTime() / 1000) : a.getTime();
  const bTime = secondsGranularity ? Math.floor(b.getTime() / 1000) : b.getTime();
  return aTime - bTime;
}

function resolveRange(size: number, range?: R2Range): { offset: number; length: number } | undefined {
  if (!range) return undefined;
  if ("suffix" in range) {
    const length = Math.min(Math.max(range.suffix, 0), size);
    return { offset: size - length, length };
  }
  const offset = Math.max(range.offset ?? 0, 0);
  if (offset >= size && size !== 0) {
    throw new R2Error("Range starts after the end of the object", { action: "get" });
  }
  return {
    offset,
    length: Math.min(Math.max(range.length ?? size - offset, 0), size - offset),
  };
}

function fromStoredObject(object: StoredObject): R2ObjectData {
  return {
    key: object.key,
    version: object.version,
    size: object.size,
    etag: object.etag,
    uploaded: new Date(object.uploaded),
    checksums: decodeChecksums(object.checksums),
    httpMetadata: deserializeHttpMetadata(object.httpMetadata),
    customMetadata: object.customMetadata ? { ...object.customMetadata } : undefined,
    storageClass: object.storageClass,
  };
}

function serializeHttpMetadata(
  metadata?: R2HTTPMetadata,
): StoredObject["httpMetadata"] {
  if (!metadata) return undefined;
  return {
    ...metadata,
    cacheExpiry: metadata.cacheExpiry?.toISOString(),
  };
}

function deserializeHttpMetadata(
  metadata?: StoredObject["httpMetadata"],
): R2HTTPMetadata | undefined {
  if (!metadata) return undefined;
  return {
    ...metadata,
    cacheExpiry: metadata.cacheExpiry ? new Date(metadata.cacheExpiry) : undefined,
  };
}

function encodeChecksums(
  checksums: Partial<Record<R2ChecksumAlgorithm, Uint8Array>>,
): Partial<Record<R2ChecksumAlgorithm, string>> {
  return Object.fromEntries(
    Object.entries(checksums).map(([algorithm, value]) => [
      algorithm,
      Buffer.from(value).toString("base64"),
    ]),
  );
}

function decodeChecksums(
  checksums: Partial<Record<R2ChecksumAlgorithm, string>>,
): Partial<Record<R2ChecksumAlgorithm, Uint8Array>> {
  return Object.fromEntries(
    Object.entries(checksums).map(([algorithm, value]) => [
      algorithm,
      new Uint8Array(Buffer.from(value, "base64")),
    ]),
  );
}

function validateChecksums(
  actual: Partial<Record<R2ChecksumAlgorithm, Uint8Array>>,
  expected: Partial<Record<R2ChecksumAlgorithm, Uint8Array>> = {},
): void {
  for (const algorithm of checksumAlgorithms) {
    const expectedValue = expected[algorithm];
    if (!expectedValue) continue;
    const actualValue = actual[algorithm];
    if (
      !actualValue ||
      actualValue.byteLength !== expectedValue.byteLength ||
      !timingSafeEqual(actualValue, expectedValue)
    ) {
      throw new R2Error(`${algorithm} checksum did not match`, { action: "put" });
    }
  }
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function toHex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}

function stripEtag(value: string): string {
  return value.replace(/^W\//, "").replace(/^"|"$/g, "");
}

function toWebStream(stream: ReadStream | Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

function emptyWebStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(value), { flag: "wx" });
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString("base64url");
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Number.isInteger(value.offset) || value.offset < 0) throw new Error();
    return value.offset;
  } catch {
    throw new R2Error("Invalid list cursor", { action: "list" });
  }
}

function cloneDate(value?: Date): Date | undefined {
  return value ? new Date(value) : undefined;
}

function assertNoSsec(value?: Uint8Array): void {
  if (value) {
    throw new R2Error("SSE-C is not supported by FileSystemR2Service", {
      action: "ssec",
    });
  }
}
