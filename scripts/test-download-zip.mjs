import test from "node:test";
import assert from "node:assert/strict";
import { downloadFilesAsZip } from "../apps/web/lib/downloadZip.ts";

test("downloadFilesAsZip: validation and failure paths", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;

  t.afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
    globalThis.URL = originalUrl;
  });

  await t.test("rejects when no files are provided", async () => {
    await assert.rejects(
      () => downloadFilesAsZip([], "test.zip"),
      /No files provided to generate ZIP archive/
    );
    await assert.rejects(
      () => downloadFilesAsZip(null, "test.zip"),
      /No files provided to generate ZIP archive/
    );
  });

  await t.test("rejects with network error when fetch fails", async () => {
    globalThis.fetch = async () => {
      throw new Error("Network offline");
    };

    await assert.rejects(
      () => downloadFilesAsZip([{ name: "doc1.pdf", url: "blob:http://localhost/doc1" }], "test.zip"),
      /Network offline/
    );
  });

  await t.test("rejects when fetch returns non-ok HTTP status (e.g. 404 or revoked blob)", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      blob: async () => new Blob(["not found"]),
    });

    await assert.rejects(
      () => downloadFilesAsZip([{ name: "missing.pdf", url: "blob:http://localhost/missing" }], "test.zip"),
      /Failed to fetch file "missing\.pdf": 404 Not Found/
    );
  });

  await t.test("rejects when fetch returns 500 error", async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      blob: async () => new Blob(["error"]),
    });

    await assert.rejects(
      () => downloadFilesAsZip([{ name: "error.pdf", url: "blob:http://localhost/error" }], "test.zip"),
      /Failed to fetch file "error\.pdf": 500 Internal Server Error/
    );
  });

  await t.test("rejects when ZIP generation fails due to corrupt input", async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => ({
        arrayBuffer: async () => {
          throw new Error("Corrupted stream read error");
        },
      }),
    });

    await assert.rejects(
      () => downloadFilesAsZip([{ name: "corrupt.pdf", url: "blob:http://localhost/corrupt" }], "test.zip"),
      /Can't read the data of 'corrupt\.pdf'/
    );
  });

  await t.test("successful download triggers DOM click and schedules object URL revocation", async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => new Blob(["valid-pdf-data"], { type: "application/pdf" }),
    });

    let createdUrl = null;

    globalThis.URL = {
      ...originalUrl,
      createObjectURL: () => {
        createdUrl = "blob:http://localhost/mock-zip-uuid";
        return createdUrl;
      },
      revokeObjectURL: () => {},
    };

    let appended = false;
    let clicked = false;
    let removed = false;
    let downloadAttr = "";

    const mockAnchor = {
      set href(val) { this._href = val; },
      get href() { return this._href; },
      set download(val) { downloadAttr = val; },
      get download() { return downloadAttr; },
      click() { clicked = true; },
    };

    globalThis.document = {
      createElement: (tag) => {
        if (tag === "a") return mockAnchor;
        return {};
      },
      body: {
        appendChild: () => { appended = true; },
        removeChild: () => { removed = true; },
      },
    };

    await downloadFilesAsZip([{ name: "test.pdf", url: "blob:http://localhost/test" }], "my_archive");

    assert.equal(createdUrl, "blob:http://localhost/mock-zip-uuid");
    assert.equal(downloadAttr, "my_archive.zip");
    assert.equal(appended, true);
    assert.equal(clicked, true);
    assert.equal(removed, true);
  });
});
