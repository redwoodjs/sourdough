import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { R2Service } from "../src/service.js";

export interface R2ServiceTestContext {
  service: R2Service;
  cleanup(): Promise<void>;
}

export function runR2ServiceConformance(
  name: string,
  createContext: () => Promise<R2ServiceTestContext>,
): void {
  describe(`${name} R2Service conformance`, () => {
    let context: R2ServiceTestContext;

    beforeEach(async () => {
      context = await createContext();
    });

    afterEach(async () => {
      await context.cleanup();
    });

    it("stores, reads, replaces, and deletes an object", async () => {
      const first = await context.service.put("hello.txt", body("hello"), {
        httpMetadata: { contentType: "text/plain" },
        customMetadata: { language: "en" },
      });

      expect(first).toMatchObject({
        key: "hello.txt",
        size: 5,
        httpMetadata: { contentType: "text/plain" },
        customMetadata: { language: "en" },
      });
      expect(first?.checksums?.md5).toBeInstanceOf(Uint8Array);

      const head = await context.service.head("hello.txt");
      expect(head?.etag).toBe(first?.etag);

      const result = await context.service.get("hello.txt");
      expect(await text(result?.body)).toBe("hello");

      const replacement = await context.service.put("hello.txt", body("goodbye"));
      expect(replacement?.version).not.toBe(first?.version);
      expect(await text((await context.service.get("hello.txt"))?.body)).toBe("goodbye");

      await context.service.delete("hello.txt");
      expect(await context.service.head("hello.txt")).toBeNull();
    });

    it("applies conditions and byte ranges", async () => {
      const object = await context.service.put("range", body("0123456789"));
      expect(object).not.toBeNull();

      const failed = await context.service.get("range", {
        onlyIf: { etagMatches: "not-the-etag" },
      });
      expect(failed?.conditionFailed).toBe(true);
      expect(failed?.body).toBeUndefined();

      const ranged = await context.service.get("range", {
        onlyIf: { etagMatches: object!.etag },
        range: { offset: 2, length: 4 },
      });
      expect(await text(ranged?.body)).toBe("2345");
      expect(ranged?.object.range).toEqual({ offset: 2, length: 4 });

      const rejectedPut = await context.service.put("range", body("no"), {
        onlyIf: { etagDoesNotMatch: "*" },
      });
      expect(rejectedPut).toBeNull();
      expect(await text((await context.service.get("range"))?.body)).toBe("0123456789");
    });

    it("lists with prefixes, delimiters, and cursors", async () => {
      await context.service.put("images/cat.jpg", body("cat"));
      await context.service.put("images/dog.jpg", body("dog"));
      await context.service.put("notes/todo.txt", body("todo"));

      const firstPage = await context.service.list({ prefix: "images/", limit: 1 });
      expect(firstPage.objects.map(object => object.key)).toEqual(["images/cat.jpg"]);
      expect(firstPage.truncated).toBe(true);
      expect(firstPage.cursor).toBeTruthy();

      const secondPage = await context.service.list({
        prefix: "images/",
        cursor: firstPage.cursor,
      });
      expect(secondPage.objects.map(object => object.key)).toEqual(["images/dog.jpg"]);
      expect(secondPage.truncated).toBe(false);

      const delimited = await context.service.list({ delimiter: "/" });
      expect(delimited.objects).toEqual([]);
      expect(delimited.delimitedPrefixes).toEqual(["images/", "notes/"]);
    });

    it("publishes complete values during concurrent replacement", async () => {
      const values = Array.from({ length: 12 }, (_, index) =>
        `${index}:`.padEnd(16_384, String(index % 10)),
      );
      await Promise.all(
        values.map(value => context.service.put("contended", body(value))),
      );

      const stored = await text((await context.service.get("contended"))?.body);
      expect(values).toContain(stored);
    });

    it("completes and aborts multipart uploads", async () => {
      const upload = await context.service.createMultipartUpload("multipart.txt", {
        httpMetadata: { contentType: "text/plain" },
      });
      const part1 = await context.service.uploadPart(
        upload.key,
        upload.uploadId,
        1,
        body("hello "),
      );
      const part2 = await context.service.uploadPart(
        upload.key,
        upload.uploadId,
        2,
        body("world"),
      );
      const object = await context.service.completeMultipartUpload(
        upload.key,
        upload.uploadId,
        [part1, part2],
      );

      expect(object.httpMetadata?.contentType).toBe("text/plain");
      expect(await text((await context.service.get("multipart.txt"))?.body)).toBe(
        "hello world",
      );

      const aborted = await context.service.createMultipartUpload("aborted");
      await context.service.abortMultipartUpload(aborted.key, aborted.uploadId);
      await expect(
        context.service.uploadPart(aborted.key, aborted.uploadId, 1, body("no")),
      ).rejects.toThrow("does not exist");
    });

    it("rejects a checksum mismatch without publishing the object", async () => {
      await expect(
        context.service.put("bad-checksum", body("content"), {
          expectedChecksums: { md5: new Uint8Array(16) },
        }),
      ).rejects.toThrow("checksum did not match");
      expect(await context.service.head("bad-checksum")).toBeNull();
    });
  });
}

function body(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

async function text(body?: ReadableStream<Uint8Array>): Promise<string | undefined> {
  return body ? new Response(body).text() : undefined;
}
