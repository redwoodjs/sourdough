import {
  defineBinding,
  resolveService,
  type BindingDefinition,
  type ServiceInput,
} from "../../../src/env.js";
import type {
  R2Service,
  R2ServiceGetOptions,
  R2ServiceMultipartOptions,
  R2ServicePutOptions,
} from "./service.js";
import {
  R2Error,
  R2Object,
  R2ObjectBody,
  checksumAlgorithms,
  type R2Body,
  type R2ChecksumAlgorithm,
  type R2ChecksumInput,
  type R2Conditional,
  type R2GetOptions,
  type R2HTTPMetadata,
  type R2ListOptions,
  type R2MultipartOptions,
  type R2MultipartUpload,
  type R2Objects,
  type R2PutOptions,
  type R2Range,
  type R2UploadedPart,
  type R2UploadPartOptions,
} from "./types.js";

export interface R2BindingOptions {
  service: ServiceInput<R2Service>;
}

/** Defines an R2 binding that is materialized under its env binding name. */
export function r2(options: R2BindingOptions): BindingDefinition<R2Bucket> {
  return defineBinding(context =>
    new R2Bucket(resolveService(options.service, context)),
  );
}

export class R2Bucket {
  constructor(private readonly service: R2Service) {}

  async head(key: string): Promise<R2Object | null> {
    const object = await this.service.head(key);
    return object ? new R2Object(object) : null;
  }

  async get(
    key: string,
    options: R2GetOptions & { onlyIf: R2Conditional | Headers },
  ): Promise<R2ObjectBody | R2Object | null>;
  async get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  async get(
    key: string,
    options: R2GetOptions = {},
  ): Promise<R2ObjectBody | R2Object | null> {
    const result = await this.service.get(key, normalizeGetOptions(options));
    if (!result) return null;
    if (result.conditionFailed || !result.body) return new R2Object(result.object);
    return new R2ObjectBody(result.object, result.body);
  }

  async put(
    key: string,
    value: R2Body,
    options: R2PutOptions & { onlyIf: R2Conditional | Headers },
  ): Promise<R2Object | null>;
  async put(key: string, value: R2Body, options?: R2PutOptions): Promise<R2Object>;
  async put(
    key: string,
    value: R2Body,
    options: R2PutOptions = {},
  ): Promise<R2Object | null> {
    const object = await this.service.put(
      key,
      toReadableStream(value),
      normalizePutOptions(options),
    );
    return object ? new R2Object(object) : null;
  }

  delete(keys: string | string[]): Promise<void> {
    return this.service.delete(keys);
  }

  async list(options: R2ListOptions = {}): Promise<R2Objects> {
    const result = await this.service.list(options);
    return {
      objects: result.objects.map(object => new R2Object(object)),
      delimitedPrefixes: [...result.delimitedPrefixes],
      truncated: result.truncated,
      ...(result.cursor ? { cursor: result.cursor } : {}),
    };
  }

  async createMultipartUpload(
    key: string,
    options: R2MultipartOptions = {},
  ): Promise<R2MultipartUpload> {
    const upload = await this.service.createMultipartUpload(
      key,
      normalizeMultipartOptions(options),
    );
    return new R2MultipartUploadAdapter(this.service, upload.key, upload.uploadId);
  }

  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload {
    return new R2MultipartUploadAdapter(this.service, key, uploadId);
  }
}

class R2MultipartUploadAdapter implements R2MultipartUpload {
  constructor(
    private readonly service: R2Service,
    readonly key: string,
    readonly uploadId: string,
  ) {}

  uploadPart(
    partNumber: number,
    value: Exclude<R2Body, null>,
    options: R2UploadPartOptions = {},
  ): Promise<R2UploadedPart> {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
      throw new R2Error("Multipart part number must be between 1 and 10000", {
        action: "uploadPart",
      });
    }
    return this.service.uploadPart(
      this.key,
      this.uploadId,
      partNumber,
      toReadableStream(value),
      { ssecKey: normalizeSsecKey(options.ssecKey) },
    );
  }

  abort(): Promise<void> {
    return this.service.abortMultipartUpload(this.key, this.uploadId);
  }

  async complete(uploadedParts: R2UploadedPart[]): Promise<R2Object> {
    const object = await this.service.completeMultipartUpload(
      this.key,
      this.uploadId,
      uploadedParts,
    );
    return new R2Object(object);
  }
}

function normalizeGetOptions(options: R2GetOptions): R2ServiceGetOptions {
  return {
    onlyIf: normalizeConditional(options.onlyIf),
    range: normalizeRange(options.range),
    ssecKey: normalizeSsecKey(options.ssecKey),
  };
}

function normalizePutOptions(options: R2PutOptions): R2ServicePutOptions {
  const expectedChecksums: Partial<Record<R2ChecksumAlgorithm, Uint8Array>> = {};
  for (const algorithm of checksumAlgorithms) {
    const value = options[algorithm];
    if (value !== undefined) expectedChecksums[algorithm] = checksumBytes(value);
  }
  if (Object.keys(expectedChecksums).length > 1) {
    throw new R2Error("Only one checksum algorithm can be specified", {
      action: "put",
    });
  }

  return {
    onlyIf: normalizeConditional(options.onlyIf),
    httpMetadata: normalizeHttpMetadata(options.httpMetadata),
    customMetadata: options.customMetadata ? { ...options.customMetadata } : undefined,
    expectedChecksums,
    storageClass: options.storageClass,
    ssecKey: normalizeSsecKey(options.ssecKey),
  };
}

function normalizeMultipartOptions(
  options: R2MultipartOptions,
): R2ServiceMultipartOptions {
  return {
    httpMetadata: normalizeHttpMetadata(options.httpMetadata),
    customMetadata: options.customMetadata ? { ...options.customMetadata } : undefined,
    storageClass: options.storageClass,
    ssecKey: normalizeSsecKey(options.ssecKey),
  };
}

function normalizeConditional(
  condition?: R2Conditional | Headers,
): R2Conditional | undefined {
  if (!condition) return undefined;
  if (!(condition instanceof Headers)) {
    return {
      ...condition,
      uploadedBefore: cloneDate(condition.uploadedBefore),
      uploadedAfter: cloneDate(condition.uploadedAfter),
    };
  }

  const etagMatches = condition.get("if-match") ?? undefined;
  const etagDoesNotMatch = condition.get("if-none-match") ?? undefined;
  const uploadedBefore = parseHttpDate(condition.get("if-unmodified-since"));
  const uploadedAfter = parseHttpDate(condition.get("if-modified-since"));
  if (!etagMatches && !etagDoesNotMatch && !uploadedBefore && !uploadedAfter) {
    return undefined;
  }
  return {
    etagMatches: stripEtag(etagMatches),
    etagDoesNotMatch: stripEtag(etagDoesNotMatch),
    uploadedBefore,
    uploadedAfter,
    secondsGranularity: true,
  };
}

function normalizeRange(range?: R2Range | Headers): R2Range | undefined {
  if (!range) return undefined;
  if (!(range instanceof Headers)) return { ...range };
  const header = range.get("range");
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) throw new R2Error(`Invalid range header: ${header}`, { action: "get" });
  const [, start, end] = match;
  if (!start && !end) throw new R2Error(`Invalid range header: ${header}`, { action: "get" });
  if (!start) return { suffix: Number(end) };
  const offset = Number(start);
  if (!end) return { offset };
  const finalByte = Number(end);
  if (finalByte < offset) throw new R2Error(`Invalid range header: ${header}`, { action: "get" });
  return { offset, length: finalByte - offset + 1 };
}

function normalizeHttpMetadata(
  metadata?: R2HTTPMetadata | Headers,
): R2HTTPMetadata | undefined {
  if (!metadata) return undefined;
  if (!(metadata instanceof Headers)) {
    return {
      ...metadata,
      cacheExpiry: cloneDate(metadata.cacheExpiry),
    };
  }

  return removeUndefined({
    contentType: metadata.get("content-type") ?? undefined,
    contentLanguage: metadata.get("content-language") ?? undefined,
    contentDisposition: metadata.get("content-disposition") ?? undefined,
    contentEncoding: metadata.get("content-encoding") ?? undefined,
    cacheControl: metadata.get("cache-control") ?? undefined,
    cacheExpiry: parseHttpDate(metadata.get("expires")),
  });
}

function toReadableStream(value: R2Body): ReadableStream<Uint8Array> {
  if (value === null) return streamBytes(new Uint8Array());
  if (isReadableStream(value)) return value;
  if (typeof value === "string") return streamBytes(new TextEncoder().encode(value));
  if (value instanceof Blob) return value.stream() as ReadableStream<Uint8Array>;
  if (value instanceof ArrayBuffer) return streamBytes(new Uint8Array(value.slice(0)));
  if (ArrayBuffer.isView(value)) {
    return streamBytes(
      new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)),
    );
  }
  throw new R2Error("Unsupported R2 body type", { action: "put" });
}

function streamBytes(value: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(value);
      controller.close();
    },
  });
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return !!value && typeof (value as ReadableStream).getReader === "function";
}

function checksumBytes(value: R2ChecksumInput): Uint8Array {
  if (typeof value === "string") {
    if (!/^(?:[0-9a-fA-F]{2})+$/.test(value)) {
      throw new R2Error("Checksum strings must be hexadecimal", { action: "put" });
    }
    return Uint8Array.from(value.match(/.{2}/g)!, byte => Number.parseInt(byte, 16));
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  return new Uint8Array(
    value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
  );
}

function normalizeSsecKey(value?: ArrayBuffer | string): Uint8Array | undefined {
  if (value === undefined) return undefined;
  const bytes = typeof value === "string"
    ? checksumBytes(value)
    : new Uint8Array(value.slice(0));
  if (bytes.byteLength !== 32) {
    throw new R2Error("SSE-C keys must be exactly 32 bytes", { action: "ssec" });
  }
  return bytes;
}

function parseHttpDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time);
}

function stripEtag(value?: string): string | undefined {
  if (!value || value === "*") return value;
  return value.replace(/^W\//, "").replace(/^"|"$/g, "");
}

function cloneDate(value?: Date): Date | undefined {
  return value ? new Date(value) : undefined;
}

function removeUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}
