export type R2Body =
  | ReadableStream<Uint8Array>
  | ArrayBuffer
  | ArrayBufferView
  | string
  | null
  | Blob;

export interface R2ListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  startAfter?: string;
  include?: Array<"httpMetadata" | "customMetadata">;
}

export type R2Range =
  | { offset: number; length?: number }
  | { offset?: number; length: number }
  | { suffix: number };

export interface R2Conditional {
  etagMatches?: string;
  etagDoesNotMatch?: string;
  uploadedBefore?: Date;
  uploadedAfter?: Date;
  secondsGranularity?: boolean;
}

export interface R2GetOptions {
  onlyIf?: R2Conditional | Headers;
  range?: R2Range | Headers;
  ssecKey?: ArrayBuffer | string;
}

export type R2ChecksumInput = ArrayBuffer | ArrayBufferView | string;

export interface R2PutOptions {
  onlyIf?: R2Conditional | Headers;
  httpMetadata?: R2HTTPMetadata | Headers;
  customMetadata?: Record<string, string>;
  md5?: R2ChecksumInput;
  sha1?: R2ChecksumInput;
  sha256?: R2ChecksumInput;
  sha384?: R2ChecksumInput;
  sha512?: R2ChecksumInput;
  storageClass?: string;
  ssecKey?: ArrayBuffer | string;
}

export interface R2MultipartOptions {
  httpMetadata?: R2HTTPMetadata | Headers;
  customMetadata?: Record<string, string>;
  storageClass?: string;
  ssecKey?: ArrayBuffer | string;
}

export interface R2UploadPartOptions {
  ssecKey?: ArrayBuffer | string;
}

export interface R2HTTPMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date;
}

export interface R2UploadedPart {
  partNumber: number;
  etag: string;
}

export interface R2Objects {
  objects: R2Object[];
  delimitedPrefixes: string[];
  truncated: boolean;
  cursor?: string;
}

export interface R2MultipartUpload {
  readonly key: string;
  readonly uploadId: string;
  uploadPart(
    partNumber: number,
    value: Exclude<R2Body, null>,
    options?: R2UploadPartOptions,
  ): Promise<R2UploadedPart>;
  abort(): Promise<void>;
  complete(uploadedParts: R2UploadedPart[]): Promise<R2Object>;
}

export interface R2ObjectData {
  key: string;
  version: string;
  size: number;
  etag: string;
  uploaded: Date;
  checksums?: Partial<Record<R2ChecksumAlgorithm, Uint8Array>>;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  range?: R2Range;
  storageClass?: string;
  ssecKeyMd5?: string;
}

export type R2ChecksumAlgorithm =
  | "md5"
  | "sha1"
  | "sha256"
  | "sha384"
  | "sha512";

export class R2Checksums {
  readonly md5?: ArrayBuffer;
  readonly sha1?: ArrayBuffer;
  readonly sha256?: ArrayBuffer;
  readonly sha384?: ArrayBuffer;
  readonly sha512?: ArrayBuffer;

  constructor(values: Partial<Record<R2ChecksumAlgorithm, Uint8Array>> = {}) {
    this.md5 = copyBuffer(values.md5);
    this.sha1 = copyBuffer(values.sha1);
    this.sha256 = copyBuffer(values.sha256);
    this.sha384 = copyBuffer(values.sha384);
    this.sha512 = copyBuffer(values.sha512);
  }

  toJSON(): Partial<Record<R2ChecksumAlgorithm, string>> {
    const result: Partial<Record<R2ChecksumAlgorithm, string>> = {};
    for (const algorithm of checksumAlgorithms) {
      const value = this[algorithm];
      if (value) result[algorithm] = toHex(new Uint8Array(value));
    }
    return result;
  }
}

export class R2Object {
  readonly key: string;
  readonly version: string;
  readonly size: number;
  readonly etag: string;
  readonly httpEtag: string;
  readonly checksums: R2Checksums;
  readonly uploaded: Date;
  readonly httpMetadata?: R2HTTPMetadata;
  readonly customMetadata?: Record<string, string>;
  readonly range?: R2Range;
  readonly storageClass: string;
  readonly ssecKeyMd5?: string;

  constructor(data: R2ObjectData) {
    this.key = data.key;
    this.version = data.version;
    this.size = data.size;
    this.etag = data.etag;
    this.httpEtag = `"${data.etag}"`;
    this.checksums = new R2Checksums(data.checksums);
    this.uploaded = new Date(data.uploaded);
    this.httpMetadata = data.httpMetadata
      ? { ...data.httpMetadata, cacheExpiry: cloneDate(data.httpMetadata.cacheExpiry) }
      : undefined;
    this.customMetadata = data.customMetadata ? { ...data.customMetadata } : undefined;
    this.range = data.range ? { ...data.range } : undefined;
    this.storageClass = data.storageClass ?? "Standard";
    this.ssecKeyMd5 = data.ssecKeyMd5;
  }

  writeHttpMetadata(headers: Headers): void {
    const metadata = this.httpMetadata;
    if (!metadata) return;
    if (metadata.contentType) headers.set("content-type", metadata.contentType);
    if (metadata.contentLanguage) headers.set("content-language", metadata.contentLanguage);
    if (metadata.contentDisposition) headers.set("content-disposition", metadata.contentDisposition);
    if (metadata.contentEncoding) headers.set("content-encoding", metadata.contentEncoding);
    if (metadata.cacheControl) headers.set("cache-control", metadata.cacheControl);
    if (metadata.cacheExpiry) headers.set("expires", metadata.cacheExpiry.toUTCString());
  }
}

export class R2ObjectBody extends R2Object {
  readonly #response: Response;

  constructor(data: R2ObjectData, body: ReadableStream<Uint8Array>) {
    super(data);
    this.#response = new Response(body);
  }

  get body(): ReadableStream<Uint8Array> {
    return this.#response.body as ReadableStream<Uint8Array>;
  }

  get bodyUsed(): boolean {
    return this.#response.bodyUsed;
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    return this.#response.arrayBuffer();
  }

  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(await this.arrayBuffer());
  }

  text(): Promise<string> {
    return this.#response.text();
  }

  json<T>(): Promise<T> {
    return this.#response.json() as Promise<T>;
  }

  blob(): Promise<Blob> {
    return this.#response.blob();
  }
}

export class R2Error extends Error {
  readonly code: number;
  readonly action: string;

  constructor(message: string, options: { code?: number; action?: string } = {}) {
    super(message);
    this.name = "R2Error";
    this.code = options.code ?? 10001;
    this.action = options.action ?? "r2";
  }
}

export const checksumAlgorithms: readonly R2ChecksumAlgorithm[] = [
  "md5",
  "sha1",
  "sha256",
  "sha384",
  "sha512",
];

function copyBuffer(value?: Uint8Array): ArrayBuffer | undefined {
  if (!value) return undefined;
  return value.slice().buffer;
}

function cloneDate(value?: Date): Date | undefined {
  return value ? new Date(value) : undefined;
}

function toHex(value: Uint8Array): string {
  return Array.from(value, byte => byte.toString(16).padStart(2, "0")).join("");
}
