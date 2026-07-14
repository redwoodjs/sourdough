import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { R2Bucket } from "./binding.js";
import { FileSystemR2Service } from "./providers/node/filesystem.js";
import { R2Object, R2ObjectBody } from "./types.js";

describe("R2Bucket", () => {
  let root: string;
  let bucket: R2Bucket;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sourdough-r2-binding-"));
    bucket = new R2Bucket(new FileSystemR2Service(root));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("exposes Cloudflare-compatible object metadata and body helpers", async () => {
    const headers = new Headers({
      "content-type": "application/json",
      "cache-control": "max-age=60",
    });
    const md5 = createHash("md5").update('{"ok":true}').digest("hex");
    const object = await bucket.put("result.json", '{"ok":true}', {
      httpMetadata: headers,
      customMetadata: { source: "test" },
      md5,
    });

    expect(object).toBeInstanceOf(R2Object);
    expect(object).toMatchObject({
      key: "result.json",
      size: 11,
      httpMetadata: {
        contentType: "application/json",
        cacheControl: "max-age=60",
      },
      customMetadata: { source: "test" },
      storageClass: "Standard",
    });
    expect(object.httpEtag).toBe(`"${object.etag}"`);
    expect(object.checksums.toJSON().md5).toBe(md5);

    const metadataHeaders = new Headers();
    object.writeHttpMetadata(metadataHeaders);
    expect(metadataHeaders.get("content-type")).toBe("application/json");

    const body = await bucket.get("result.json");
    expect(body).toBeInstanceOf(R2ObjectBody);
    expect(body?.bodyUsed).toBe(false);
    expect(await body?.json()).toEqual({ ok: true });
    expect(body?.bodyUsed).toBe(true);
  });

  it("normalizes conditional and range headers", async () => {
    const object = await bucket.put("video", "0123456789");

    const rangeHeaders = new Headers({ range: "bytes=3-6" });
    const ranged = await bucket.get("video", { range: rangeHeaders });
    expect(ranged?.range).toEqual({ offset: 3, length: 4 });
    expect(await ranged?.text()).toBe("3456");

    const failedCondition = await bucket.get("video", {
      onlyIf: new Headers({ "if-match": '"wrong"' }),
    });
    expect(failedCondition).toBeInstanceOf(R2Object);
    expect(failedCondition).not.toBeInstanceOf(R2ObjectBody);

    const matched = await bucket.get("video", {
      onlyIf: new Headers({ "if-match": object.httpEtag }),
    });
    expect(matched).toBeInstanceOf(R2ObjectBody);
  });

  it("supports binary, blob, and streamed bodies", async () => {
    await bucket.put("buffer", new Uint8Array([1, 2, 3]));
    await bucket.put("blob", new Blob(["blob"]));
    await bucket.put(
      "stream",
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("stream"));
          controller.close();
        },
      }),
    );

    expect([...await (await bucket.get("buffer"))!.bytes()]).toEqual([1, 2, 3]);
    expect(await (await bucket.get("blob"))!.text()).toBe("blob");
    expect(await (await bucket.get("stream"))!.text()).toBe("stream");
  });

  it("supports list metadata selection and multipart uploads", async () => {
    await bucket.put("one", "1", { customMetadata: { included: "yes" } });

    const withoutMetadata = await bucket.list();
    expect(withoutMetadata.objects[0].customMetadata).toBeUndefined();

    const withMetadata = await bucket.list({ include: ["customMetadata"] });
    expect(withMetadata.objects[0].customMetadata).toEqual({ included: "yes" });

    const upload = await bucket.createMultipartUpload("combined", {
      customMetadata: { multipart: "yes" },
    });
    const first = await upload.uploadPart(1, "first");
    const second = await upload.uploadPart(2, "second");
    const completed = await upload.complete([first, second]);

    expect(completed.customMetadata).toEqual({ multipart: "yes" });
    expect(await (await bucket.get("combined"))!.text()).toBe("firstsecond");
  });

  it("validates SSE-C keys and lets the provider report support", async () => {
    await expect(
      bucket.put("invalid-key", "value", { ssecKey: new ArrayBuffer(16) }),
    ).rejects.toThrow("exactly 32 bytes");
    await expect(
      bucket.put("unsupported-key", "value", { ssecKey: new ArrayBuffer(32) }),
    ).rejects.toThrow("not supported by FileSystemR2Service");
  });

  it("isolates buckets backed by different providers", async () => {
    const otherRoot = await mkdtemp(path.join(tmpdir(), "sourdough-r2-other-"));
    try {
      const other = new R2Bucket(new FileSystemR2Service(otherRoot));
      await bucket.put("same-key", "first bucket");
      await other.put("same-key", "second bucket");

      expect(await (await bucket.get("same-key"))!.text()).toBe("first bucket");
      expect(await (await other.get("same-key"))!.text()).toBe("second bucket");
    } finally {
      await rm(otherRoot, { recursive: true, force: true });
    }
  });
});
