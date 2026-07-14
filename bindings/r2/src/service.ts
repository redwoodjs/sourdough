import type {
  R2ChecksumAlgorithm,
  R2Conditional,
  R2HTTPMetadata,
  R2ObjectData,
  R2Range,
  R2UploadedPart,
} from "./types.js";

export interface R2ServiceGetOptions {
  onlyIf?: R2Conditional;
  range?: R2Range;
  ssecKey?: Uint8Array;
}

export interface R2ServiceGetResult {
  object: R2ObjectData;
  body?: ReadableStream<Uint8Array>;
  conditionFailed?: boolean;
}

export interface R2ServicePutOptions {
  onlyIf?: R2Conditional;
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  expectedChecksums?: Partial<Record<R2ChecksumAlgorithm, Uint8Array>>;
  storageClass?: string;
  ssecKey?: Uint8Array;
}

export interface R2ServiceListOptions {
  limit?: number;
  prefix?: string;
  cursor?: string;
  delimiter?: string;
  startAfter?: string;
  include?: Array<"httpMetadata" | "customMetadata">;
}

export interface R2ServiceListResult {
  objects: R2ObjectData[];
  delimitedPrefixes: string[];
  truncated: boolean;
  cursor?: string;
}

export interface R2ServiceMultipartOptions {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
  storageClass?: string;
  ssecKey?: Uint8Array;
}

export interface R2ServiceMultipartUpload {
  key: string;
  uploadId: string;
}

/**
 * Backend-independent service contract used by the Cloudflare-facing R2
 * adapter. Providers can use local storage, another process, or a remote object
 * service as long as they preserve the observable semantics of this contract.
 */
export interface R2Service {
  head(key: string): Promise<R2ObjectData | null>;
  get(key: string, options?: R2ServiceGetOptions): Promise<R2ServiceGetResult | null>;
  put(
    key: string,
    body: ReadableStream<Uint8Array>,
    options?: R2ServicePutOptions,
  ): Promise<R2ObjectData | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ServiceListOptions): Promise<R2ServiceListResult>;
  createMultipartUpload(
    key: string,
    options?: R2ServiceMultipartOptions,
  ): Promise<R2ServiceMultipartUpload>;
  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: ReadableStream<Uint8Array>,
    options?: { ssecKey?: Uint8Array },
  ): Promise<R2UploadedPart>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  completeMultipartUpload(
    key: string,
    uploadId: string,
    uploadedParts: R2UploadedPart[],
  ): Promise<R2ObjectData>;
}
