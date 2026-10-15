import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "@cantoo/pdf-lib";
import { parsePageSpec, ToolError } from "../packages/core/src/index.ts";
import mergeMod from "../packages/mod-merge/src/index.ts";
import splitMod from "../packages/mod-split/src/index.ts";
import rotateMod from "../packages/mod-rotate/src/index.ts";

async function createSamplePdf(pages = 3) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([200, 200]);
    page.drawText(`Page ${i + 1}`);
  }
  return await doc.save();
}

test("parsePageSpec", async (t) => {
  await t.test("parses empty spec as all pages", () => {
    assert.deepEqual(parsePageSpec("", 4), [0, 1, 2, 3]);
    assert.deepEqual(parsePageSpec(undefined, 3), [0, 1, 2]);
    assert.deepEqual(parsePageSpec("   ", 2), [0, 1]);
  });

  await t.test("parses single pages and ranges", () => {
    assert.deepEqual(parsePageSpec("1,3", 5), [0, 2]);
    assert.deepEqual(parsePageSpec("2-4", 5), [1, 2, 3]);
    assert.deepEqual(parsePageSpec("1-2, 4-5", 5), [0, 1, 3, 4]);
  });

  await t.test("parses open ended ranges", () => {
    assert.deepEqual(parsePageSpec("3-", 5), [2, 3, 4]);
    assert.deepEqual(parsePageSpec("-2", 5), [0, 1]);
  });

  await t.test("throws on invalid ranges", () => {
    assert.throws(() => parsePageSpec("abc", 5), /Invalid page range/);
    assert.throws(() => parsePageSpec("6-7", 5), /outside 1-5/);
    assert.throws(() => parsePageSpec("4-2", 5), /outside 1-5/);
  });
});

test("mod-merge", async (t) => {
  const pdf1 = await createSamplePdf(2);
  const pdf2 = await createSamplePdf(3);
  const ctx = { signal: new AbortController().signal, onProgress: () => {} };

  await t.test("requires at least two files", async () => {
    await assert.rejects(
      async () => await mergeMod.run([{ name: "single.pdf", data: pdf1 }], {}, ctx),
      /Add at least two PDFs to merge/
    );
  });

  await t.test("merges multiple PDFs into one", async () => {
    let progressCalls = 0;
    const testCtx = {
      signal: new AbortController().signal,
      onProgress: (p) => {
        progressCalls++;
        assert.ok(p > 0 && p <= 1);
      },
    };
    const results = await mergeMod.run([
      { name: "a.pdf", data: pdf1 },
      { name: "b.pdf", data: pdf2 },
    ], {}, testCtx);

    assert.equal(results.length, 1);
    assert.equal(results[0].name, "merged.pdf");
    const mergedDoc = await PDFDocument.load(results[0].data);
    assert.equal(mergedDoc.getPageCount(), 5);
    assert.ok(progressCalls >= 2);
  });
});

test("mod-split", async (t) => {
  const pdf = await createSamplePdf(5);
  const ctx = { signal: new AbortController().signal, onProgress: () => {} };

  await t.test("splits by custom ranges", async () => {
    const results = await splitMod.run([
      { name: "sample.pdf", data: pdf },
    ], { mode: "ranges", ranges: "1-2, 3, 4-5", n: 1 }, ctx);

    assert.equal(results.length, 3);
    assert.equal(results[0].name, "sample-part1.pdf");
    assert.equal(results[1].name, "sample-part2.pdf");
    assert.equal(results[2].name, "sample-part3.pdf");

    const doc1 = await PDFDocument.load(results[0].data);
    assert.equal(doc1.getPageCount(), 2);
    const doc2 = await PDFDocument.load(results[1].data);
    assert.equal(doc2.getPageCount(), 1);
    const doc3 = await PDFDocument.load(results[2].data);
    assert.equal(doc3.getPageCount(), 2);
  });

  await t.test("splits every N pages", async () => {
    const results = await splitMod.run([
      { name: "sample.pdf", data: pdf },
    ], { mode: "every", ranges: "", n: 2 }, ctx);

    assert.equal(results.length, 3); // 2 + 2 + 1
    const doc1 = await PDFDocument.load(results[0].data);
    assert.equal(doc1.getPageCount(), 2);
    const doc2 = await PDFDocument.load(results[1].data);
    assert.equal(doc2.getPageCount(), 2);
    const doc3 = await PDFDocument.load(results[2].data);
    assert.equal(doc3.getPageCount(), 1);
  });

  await t.test("merges all ranges into one PDF when mergeAll is true", async () => {
    const results = await splitMod.run([
      { name: "sample.pdf", data: pdf },
    ], { mode: "ranges", ranges: "1-2, 4-5", n: 1, mergeAll: true }, ctx);

    assert.equal(results.length, 1);
    assert.equal(results[0].name, "sample-merged.pdf");
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPageCount(), 4);
  });

  await t.test("splits by maximum file size", async () => {
    // 5-page PDF split with small byte budget forces splitting into multiple parts
    const results = await splitMod.run([
      { name: "sample.pdf", data: pdf },
    ], { mode: "size", maxSizeBytes: 1500, allowCompression: true }, ctx);

    assert.ok(results.length >= 2);
    for (const res of results) {
      assert.ok(res.data.byteLength > 0);
    }
  });
});

test("mod-rotate", async (t) => {
  const pdf = await createSamplePdf(3);
  const ctx = { signal: new AbortController().signal, onProgress: () => {} };

  await t.test("rotates specified pages", async () => {
    const results = await rotateMod.run([
      { name: "doc.pdf", data: pdf },
    ], { degrees: "90", pages: "2" }, ctx);

    assert.equal(results.length, 1);
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPage(0).getRotation().angle, 0);
    assert.equal(doc.getPage(1).getRotation().angle, 90);
    assert.equal(doc.getPage(2).getRotation().angle, 0);
  });

  await t.test("rotates left (counter-clockwise 270 degrees)", async () => {
    const results = await rotateMod.run([
      { name: "doc.pdf", data: pdf },
    ], { degrees: "left", pages: "1" }, ctx);

    assert.equal(results.length, 1);
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPage(0).getRotation().angle, 270);
    assert.equal(doc.getPage(1).getRotation().angle, 0);
  });

  await t.test("rotates multiple files at a time", async () => {
    const pdf2 = await createSamplePdf(2);
    const results = await rotateMod.run([
      { name: "first.pdf", data: pdf },
      { name: "second.pdf", data: pdf2 },
    ], { degrees: "90" }, ctx);

    assert.equal(results.length, 2);
    assert.equal(results[0].name, "first-rotated.pdf");
    assert.equal(results[1].name, "second-rotated.pdf");

    const doc1 = await PDFDocument.load(results[0].data);
    assert.equal(doc1.getPageCount(), 3);
    assert.equal(doc1.getPage(0).getRotation().angle, 90);

    const doc2 = await PDFDocument.load(results[1].data);
    assert.equal(doc2.getPageCount(), 2);
    assert.equal(doc2.getPage(0).getRotation().angle, 90);
  });

  await t.test("excludes specified pages from rotation", async () => {
    // 3 pages: rotate 90 right, but exclude page 2
    const results = await rotateMod.run([
      { name: "doc.pdf", data: pdf },
    ], { degrees: "90", pages: "", excludePages: "2" }, ctx);

    assert.equal(results.length, 1);
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPage(0).getRotation().angle, 90);
    assert.equal(doc.getPage(1).getRotation().angle, 0); // Excluded!
    assert.equal(doc.getPage(2).getRotation().angle, 90);
  });

  await t.test("applies custom rotations to specific pages and ranges", async () => {
    // 3 pages: page 1 -> 90, page 2 -> 180, page 3 -> 270
    const results = await rotateMod.run([
      { name: "doc.pdf", data: pdf },
    ], {
      degrees: "0",
      customRotations: [
        { pages: "1", degrees: "90" },
        { pages: "2", degrees: "180" },
        { pages: "3", degrees: "270" },
      ],
    }, ctx);

    assert.equal(results.length, 1);
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPage(0).getRotation().angle, 90);
    assert.equal(doc.getPage(1).getRotation().angle, 180);
    assert.equal(doc.getPage(2).getRotation().angle, 270);
  });
});

