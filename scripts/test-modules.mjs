import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "@cantoo/pdf-lib";
import { parsePageSpec, ToolError } from "../packages/core/src/index.ts";
import mergeMod from "../packages/mod-merge/src/index.ts";
import splitMod, { DEFAULT_MAX_SIZE_BYTES } from "../packages/mod-split/src/index.ts";
import rotateMod from "../packages/mod-rotate/src/index.ts";
import removeMod from "../packages/mod-remove/src/index.ts";
import organizeMod, { reinsertBlanksAtRelativePositions } from "../packages/mod-organize/src/index.ts";
import extractMod from "../packages/mod-extract/src/index.ts";
import "./test-cancellation.mjs";
import "./test-pdf-cache-perf.mjs";
import "./test-stale-async.mjs";
import { formatPageRanges, parsePageRanges } from "../apps/web/lib/pageRanges.ts";

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
      assert.ok(res.data.byteLength <= 1500, `Part size ${res.data.byteLength} exceeds limit 1500`);
    }
  });

  await t.test("splits 100+ page document with sub-second linear/logarithmic runtime", async () => {
    const pdf120 = await createSamplePdf(120);
    const maxSizeBytes = 12000;
    const start = performance.now();
    const results = await splitMod.run([
      { name: "large.pdf", data: pdf120 },
    ], { mode: "size", maxSizeBytes, allowCompression: true }, ctx);
    const duration = performance.now() - start;

    // Runtime must be fast (well under 2.5s, previously took >6s on 100 pages)
    assert.ok(duration < 2500, `Expected duration < 2500ms, got ${duration.toFixed(1)}ms`);
    assert.ok(results.length >= 2, "Should split into multiple parts");

    let totalPagesCounted = 0;
    for (const res of results) {
      assert.ok(res.data.byteLength <= maxSizeBytes, `Part size ${res.data.byteLength} exceeds limit ${maxSizeBytes}`);
      const partDoc = await PDFDocument.load(res.data);
      totalPagesCounted += partDoc.getPageCount();
    }
    assert.equal(totalPagesCounted, 120, "All 120 pages preserved across parts");
  });

  await t.test("boundary test: single page below the limit succeeds", async () => {
    const singlePdf = await createSamplePdf(1);
    const doc = await PDFDocument.load(singlePdf);
    const exactBytes = (await doc.save({ useObjectStreams: true })).byteLength;

    const results = await splitMod.run([
      { name: "single.pdf", data: singlePdf },
    ], { mode: "size", maxSizeBytes: exactBytes + 500, allowCompression: true }, ctx);

    assert.equal(results.length, 1);
    assert.ok(results[0].data.byteLength <= exactBytes + 500);
  });

  await t.test("boundary test: single page exactly at the limit succeeds", async () => {
    const singlePdf = await createSamplePdf(1);
    const srcDoc = await PDFDocument.load(singlePdf);
    const testDoc = await PDFDocument.create();
    const [copied] = await testDoc.copyPages(srcDoc, [0]);
    testDoc.addPage(copied);
    const exactBytes = (await testDoc.save({ useObjectStreams: true })).byteLength;

    const results = await splitMod.run([
      { name: "single.pdf", data: singlePdf },
    ], { mode: "size", maxSizeBytes: exactBytes, allowCompression: true }, ctx);

    assert.equal(results.length, 1);
    assert.equal(results[0].data.byteLength, exactBytes);
  });

  await t.test("boundary test: single page above the limit produces clear error", async () => {
    const singlePdf = await createSamplePdf(1);
    const srcDoc = await PDFDocument.load(singlePdf);
    const testDoc = await PDFDocument.create();
    const [copied] = await testDoc.copyPages(srcDoc, [0]);
    testDoc.addPage(copied);
    const exactBytes = (await testDoc.save({ useObjectStreams: true })).byteLength;

    await assert.rejects(
      async () => await splitMod.run([
        { name: "single.pdf", data: singlePdf },
      ], { mode: "size", maxSizeBytes: exactBytes - 1, allowCompression: true }, ctx),
      /Page 1 size.*exceeds the maximum allowed size/i
    );
  });

  await t.test("defaults: manifest and module expose the same default 500,000 bytes", async () => {
    assert.equal(DEFAULT_MAX_SIZE_BYTES, 500000);
    const sizeField = splitMod.manifest.fields.find((f) => f.key === "maxSizeBytes");
    assert.ok(sizeField, "maxSizeBytes field exists in manifest");
    assert.equal(sizeField.default, DEFAULT_MAX_SIZE_BYTES);

    // Running with mode: "size" and no maxSizeBytes uses DEFAULT_MAX_SIZE_BYTES
    const results = await splitMod.run([
      { name: "sample.pdf", data: pdf },
    ], { mode: "size" }, ctx);
    assert.ok(results.length >= 1);
    for (const res of results) {
      assert.ok(res.data.byteLength <= DEFAULT_MAX_SIZE_BYTES);
    }
  });

  await t.test("mergeAll with size mode: rejects when total size exceeds limit", async () => {
    // 5-page PDF with small budget forces multiple parts, so mergeAll cannot fit within limit
    await assert.rejects(
      async () => await splitMod.run([
        { name: "sample.pdf", data: pdf },
      ], { mode: "size", maxSizeBytes: 1500, mergeAll: true }, ctx),
      /Cannot merge all parts into a single PDF: total size exceeds the maximum size limit/i
    );
  });

  await t.test("mergeAll with size mode: succeeds when total size fits within limit", async () => {
    // 5-page PDF fits within 500,000 bytes
    const results = await splitMod.run([
      { name: "sample.pdf", data: pdf },
    ], { mode: "size", maxSizeBytes: 500000, mergeAll: true }, ctx);

    assert.equal(results.length, 1);
    assert.equal(results[0].name, "sample-merged.pdf");
    assert.ok(results[0].data.byteLength <= 500000);
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPageCount(), 5);
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

  await t.test("rotates single page correctly in full per-page map (single non-zero page)", async () => {
    // Rotating page 3 of 3 sends { 1: 0, 2: 0, 3: 90 }
    const resultsPage3 = await rotateMod.run([
      { name: "doc.pdf", data: pdf },
    ], {
      pageRotations: { 1: 0, 2: 0, 3: 90 },
    }, ctx);
    const doc3 = await PDFDocument.load(resultsPage3[0].data);
    assert.equal(doc3.getPage(0).getRotation().angle, 0);
    assert.equal(doc3.getPage(1).getRotation().angle, 0);
    assert.equal(doc3.getPage(2).getRotation().angle, 90);

    // Rotating page 1 of 3 sends { 1: 90, 2: 0, 3: 0 } - ensure page 2 is not shadowed
    const resultsPage1 = await rotateMod.run([
      { name: "doc.pdf", data: pdf },
    ], {
      pageRotations: { 1: 90, 2: 0, 3: 0 },
    }, ctx);
    const doc1 = await PDFDocument.load(resultsPage1[0].data);
    assert.equal(doc1.getPage(0).getRotation().angle, 90);
    assert.equal(doc1.getPage(1).getRotation().angle, 0);
    assert.equal(doc1.getPage(2).getRotation().angle, 0);
  });

  await t.test("rotates first and last pages in a multi-page file", async () => {
    const pdf4 = await createSamplePdf(4);
    const results = await rotateMod.run([
      { name: "doc4.pdf", data: pdf4 },
    ], {
      degrees: 0,
      pageRotations: { 1: 90, 2: 0, 3: 0, 4: 270 },
    }, ctx);
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPage(0).getRotation().angle, 90);
    assert.equal(doc.getPage(1).getRotation().angle, 0);
    assert.equal(doc.getPage(2).getRotation().angle, 0);
    assert.equal(doc.getPage(3).getRotation().angle, 270);
  });

  await t.test("rotates multiple files with per-file per-page rotations", async () => {
    const pdf2 = await createSamplePdf(2);
    const results = await rotateMod.run([
      { name: "file1.pdf", data: pdf2 },
      { name: "file2.pdf", data: pdf },
    ], {
      fileRotations: {
        0: { pageRotations: { 1: 90, 2: 0 } },
        1: { pageRotations: { 1: 0, 2: 180, 3: 270 } },
      },
    }, ctx);

    assert.equal(results.length, 2);
    const doc1 = await PDFDocument.load(results[0].data);
    assert.equal(doc1.getPage(0).getRotation().angle, 90);
    assert.equal(doc1.getPage(1).getRotation().angle, 0);

    const doc2 = await PDFDocument.load(results[1].data);
    assert.equal(doc2.getPage(0).getRotation().angle, 0);
    assert.equal(doc2.getPage(1).getRotation().angle, 180);
    assert.equal(doc2.getPage(2).getRotation().angle, 270);
  });

  await t.test("honors precedence of explicit per-page rotations over custom rules and exclusions", async () => {
    // page 1: explicit per-page rotation (90) overrides customRotations (180)
    // page 2: customRotations (180) overrides base degrees
    // page 3: excluded via excludePages (0)
    const results = await rotateMod.run([
      { name: "doc.pdf", data: pdf },
    ], {
      degrees: "270",
      excludePages: "3",
      customRotations: [
        { pages: "1-2", degrees: "180" },
      ],
      pageRotations: { 1: 90 },
    }, ctx);

    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPage(0).getRotation().angle, 90); // explicit per-page override
    assert.equal(doc.getPage(1).getRotation().angle, 180); // custom rule
    assert.equal(doc.getPage(2).getRotation().angle, 0); // excluded
  });

  await t.test("integration test: Rotate UI payload rotating page 2 of 3 affects only page 2", async () => {
    // Simulates the exact payload constructed by RotateTool.tsx
    const results = await rotateMod.run([
      { name: "doc.pdf", data: pdf },
    ], {
      degrees: 0,
      fileRotations: {
        0: {
          pageRotations: { 1: 0, 2: 90, 3: 0 },
          degrees: 0,
        },
      },
    }, ctx);

    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPage(0).getRotation().angle, 0);
    assert.equal(doc.getPage(1).getRotation().angle, 90);
    assert.equal(doc.getPage(2).getRotation().angle, 0);
  });
});

test("mod-remove", async (t) => {
  const pdf = await createSamplePdf(5); // 5 pages
  const ctx = { signal: new AbortController().signal, onProgress: () => {} };

  await t.test("fails if no pages are selected", async () => {
    await assert.rejects(
      async () => await removeMod.run([{ name: "doc.pdf", data: pdf }], {}, ctx),
      /No pages selected for removal/
    );
  });

  await t.test("fails if all pages are removed", async () => {
    await assert.rejects(
      async () => await removeMod.run([{ name: "doc.pdf", data: pdf }], { pages: "1-5" }, ctx),
      /Cannot remove all pages/
    );
  });

  await t.test("removes single page by range string", async () => {
    const results = await removeMod.run([{ name: "doc.pdf", data: pdf }], { pages: "2" }, ctx);
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "doc-removed.pdf");
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPageCount(), 4);
  });

  await t.test("removes multiple pages and ranges", async () => {
    // remove pages 1, 3-4 from 5 pages -> keeps page 2 and page 5 (total 2 pages)
    const results = await removeMod.run([{ name: "doc.pdf", data: pdf }], { pages: "1, 3-4" }, ctx);
    assert.equal(results.length, 1);
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPageCount(), 2);
  });

  await t.test("removes pages using explicit pageIndices array", async () => {
    // 0-based index 0 and 4 -> leaves 3 pages
    const results = await removeMod.run([{ name: "report.pdf", data: pdf }], {
      pageIndices: [0, 4],
      outputFileName: "clean-report.pdf",
    }, ctx);
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "clean-report.pdf");
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPageCount(), 3);
  });

  await t.test("rejects empty pageIndices array", async () => {
    await assert.rejects(
      async () => await removeMod.run([{ name: "doc.pdf", data: pdf }], { pageIndices: [] }, ctx),
      /No pages selected for removal/
    );
  });

  await t.test("rejects out-of-range and negative indices without partial removal", async () => {
    // [0, 999] should not partially remove page 0
    await assert.rejects(
      async () => await removeMod.run([{ name: "doc.pdf", data: pdf }], { pageIndices: [0, 999] }, ctx),
      /Page index 999 is out of range for document with 5 pages/
    );

    await assert.rejects(
      async () => await removeMod.run([{ name: "doc.pdf", data: pdf }], { pageIndices: [-1, 2] }, ctx),
      /Page index -1 is out of range for document with 5 pages/
    );
  });

  await t.test("rejects string and non-integer indices", async () => {
    await assert.rejects(
      async () => await removeMod.run([{ name: "doc.pdf", data: pdf }], { pageIndices: ["0"] }, ctx),
      /Invalid page index "0"/
    );

    await assert.rejects(
      async () => await removeMod.run([{ name: "doc.pdf", data: pdf }], { pageIndices: [0, "abc"] }, ctx),
      /Invalid page index "abc"/
    );

    await assert.rejects(
      async () => await removeMod.run([{ name: "doc.pdf", data: pdf }], { pageIndices: [1.5] }, ctx),
      /Invalid page index "1.5"/
    );

    await assert.rejects(
      async () => await removeMod.run([{ name: "doc.pdf", data: pdf }], { pageIndices: [Number.NaN] }, ctx),
      /Invalid page index "NaN"/
    );
  });

  await t.test("deduplicates valid indices and removes exactly those pages", async () => {
    // 5-page document, remove pages 1 and 3 with duplicates: [1, 1, 3, 3]
    const results = await removeMod.run([{ name: "doc.pdf", data: pdf }], {
      pageIndices: [1, 1, 3, 3],
    }, ctx);
    assert.equal(results.length, 1);
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPageCount(), 3);
  });
});

test("mod-organize", async (t) => {
  const pdfA = await createSamplePdf(3); // 3 pages (0, 1, 2)
  const pdfB = await createSamplePdf(2); // 2 pages (0, 1)
  const ctx = { signal: new AbortController().signal, onProgress: () => {} };

  await t.test("sorts, rotates, deletes, and adds blank pages across PDFs", async () => {
    // Pick Page 2 from A, Page 1 from B rotated 90, a blank page, Page 0 from A
    const pages = [
      { fileIndex: 0, pageIndex: 2, rotation: 0 },
      { fileIndex: 1, pageIndex: 0, rotation: 90 },
      { isBlank: true },
      { fileIndex: 0, pageIndex: 0, rotation: 0 },
    ];

    const results = await organizeMod.run([
      { name: "docA.pdf", data: pdfA },
      { name: "docB.pdf", data: pdfB },
    ], { pages }, ctx);

    assert.equal(results.length, 1);
    assert.equal(results[0].name, "docA_organized.pdf");
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPageCount(), 4);
    assert.equal(doc.getPage(0).getRotation().angle, 0);
    assert.equal(doc.getPage(1).getRotation().angle, 90);
  });

  await t.test("throws error when no pages remain", async () => {
    await assert.rejects(async () => {
      await organizeMod.run([
        { name: "docA.pdf", data: pdfA },
      ], { pages: [] }, ctx);
    }, /No pages remaining/);
  });

  await t.test("throws error when payload contains only blank pages", async () => {
    await assert.rejects(async () => {
      await organizeMod.run([
        { name: "docA.pdf", data: pdfA },
      ], { pages: [{ isBlank: true }] }, ctx);
    }, /At least one real page is required/);

    await assert.rejects(async () => {
      await organizeMod.run([
        { name: "docA.pdf", data: pdfA },
      ], { pages: [{ isBlank: true }, { isBlank: true }] }, ctx);
    }, /At least one real page is required/);
  });

  await t.test("table-driven invalid payload validation", async () => {
    const invalidCases = [
      { name: "object payload instead of array", pages: { a: 1 }, errorRegex: /must be an array/ },
      { name: "JSON object string instead of array", pages: '{"a": 1}', errorRegex: /must be an array/ },
      { name: "number payload", pages: 42, errorRegex: /must be an array/ },
      { name: "array of primitive numbers", pages: [0, 1], errorRegex: /item must be an object/ },
      { name: "missing fileIndex", pages: [{ pageIndex: 0 }], errorRegex: /Invalid or missing fileIndex/ },
      { name: "string fileIndex", pages: [{ fileIndex: "abc", pageIndex: 0 }], errorRegex: /Invalid or missing fileIndex/ },
      { name: "string numeric fileIndex", pages: [{ fileIndex: "0", pageIndex: 0 }], errorRegex: /Invalid or missing fileIndex/ },
      { name: "fractional fileIndex", pages: [{ fileIndex: 0.5, pageIndex: 0 }], errorRegex: /Invalid or missing fileIndex/ },
      { name: "negative fileIndex", pages: [{ fileIndex: -1, pageIndex: 0 }], errorRegex: /Invalid file index -1/ },
      { name: "out-of-range fileIndex", pages: [{ fileIndex: 5, pageIndex: 0 }], errorRegex: /Invalid file index 5/ },
      { name: "missing pageIndex", pages: [{ fileIndex: 0 }], errorRegex: /Invalid or missing pageIndex/ },
      { name: "string pageIndex", pages: [{ fileIndex: 0, pageIndex: "abc" }], errorRegex: /Invalid or missing pageIndex/ },
      { name: "string numeric pageIndex", pages: [{ fileIndex: 0, pageIndex: "0" }], errorRegex: /Invalid or missing pageIndex/ },
      { name: "fractional pageIndex", pages: [{ fileIndex: 0, pageIndex: 0.5 }], errorRegex: /Invalid or missing pageIndex/ },
      { name: "negative pageIndex", pages: [{ fileIndex: 0, pageIndex: -1 }], errorRegex: /Invalid page index -1/ },
      { name: "out-of-range pageIndex", pages: [{ fileIndex: 0, pageIndex: 99 }], errorRegex: /Invalid page index 99/ },
      { name: "negative rotation", pages: [{ fileIndex: 0, pageIndex: 0, rotation: -90 }], errorRegex: /Invalid rotation value -90/ },
      { name: "non-orthogonal rotation", pages: [{ fileIndex: 0, pageIndex: 0, rotation: 45 }], errorRegex: /Invalid rotation value 45/ },
      { name: "fractional rotation", pages: [{ fileIndex: 0, pageIndex: 0, rotation: 90.5 }], errorRegex: /Invalid rotation value 90.5/ },
      { name: "NaN rotation", pages: [{ fileIndex: 0, pageIndex: 0, rotation: NaN }], errorRegex: /Invalid rotation value NaN/ },
      { name: "invalid rotation on blank item", pages: [{ fileIndex: 0, pageIndex: 0 }, { isBlank: true, rotation: -90 }], errorRegex: /Invalid rotation value -90/ },
    ];

    for (const c of invalidCases) {
      await assert.rejects(async () => {
        await organizeMod.run([{ name: "docA.pdf", data: pdfA }], { pages: c.pages }, ctx);
      }, c.errorRegex, `Failed for case: ${c.name}`);
    }
  });

  await t.test("valid round-trip test with spec array and JSON string", async () => {
    const validSpec = [
      { fileIndex: 0, pageIndex: 2, rotation: 90 },
      { isBlank: true, rotation: 180 },
      { fileIndex: 0, pageIndex: 0, rotation: 270 },
      { fileIndex: 0, pageIndex: 1, rotation: 0 },
    ];

    // 1. Run with array
    const arrayResult = await organizeMod.run(
      [{ name: "docA.pdf", data: pdfA }],
      { pages: validSpec },
      ctx
    );
    assert.equal(arrayResult.length, 1);
    const docFromArray = await PDFDocument.load(arrayResult[0].data);
    assert.equal(docFromArray.getPageCount(), 4);
    assert.equal(docFromArray.getPage(0).getRotation().angle, 90);
    assert.equal(docFromArray.getPage(1).getRotation().angle, 180);
    assert.equal(docFromArray.getPage(2).getRotation().angle, 270);
    assert.equal(docFromArray.getPage(3).getRotation().angle, 0);

    // 2. Run with JSON string
    const jsonResult = await organizeMod.run(
      [{ name: "docA.pdf", data: pdfA }],
      { pages: JSON.stringify(validSpec) },
      ctx
    );
    assert.equal(jsonResult.length, 1);
    const docFromJson = await PDFDocument.load(jsonResult[0].data);
    assert.equal(docFromJson.getPageCount(), 4);
    assert.equal(docFromJson.getPage(0).getRotation().angle, 90);
    assert.equal(docFromJson.getPage(1).getRotation().angle, 180);
    assert.equal(docFromJson.getPage(2).getRotation().angle, 270);
    assert.equal(docFromJson.getPage(3).getRotation().angle, 0);
  });

  await t.test("reorder paths: preserves blanks at start, middle, and end during file reorder", () => {
    const original = [
      { id: "b-start", isBlank: true },
      { id: "a1", fileIndex: 0 },
      { id: "b-mid", isBlank: true },
      { id: "b1", fileIndex: 1 },
      { id: "b-end", isBlank: true },
    ];
    // Reorder: file 1 then file 0
    const reordered = [
      { id: "b1", fileIndex: 0 },
      { id: "a1", fileIndex: 1 },
    ];
    const result = reinsertBlanksAtRelativePositions(original, reordered);
    assert.equal(result.length, 5);
    assert.equal(result[0].id, "b-start");
    assert.equal(result[1].id, "b1");
    assert.equal(result[2].id, "b-mid");
    assert.equal(result[3].id, "a1");
    assert.equal(result[4].id, "b-end");
  });

  await t.test("numeric sort: preserves blanks at start, middle, and end", () => {
    const original = [
      { id: "b-start", isBlank: true },
      { id: "p1", fileIndex: 0, pageIndex: 0 },
      { id: "b-mid", isBlank: true },
      { id: "p2", fileIndex: 0, pageIndex: 1 },
      { id: "b-end", isBlank: true },
    ];
    // Sort descending 9-1
    const sortedDesc = [
      { id: "p2", fileIndex: 0, pageIndex: 1 },
      { id: "p1", fileIndex: 0, pageIndex: 0 },
    ];
    const resultDesc = reinsertBlanksAtRelativePositions(original, sortedDesc);
    assert.equal(resultDesc.length, 5);
    assert.equal(resultDesc[0].id, "b-start");
    assert.equal(resultDesc[1].id, "p2");
    assert.equal(resultDesc[2].id, "b-mid");
    assert.equal(resultDesc[3].id, "p1");
    assert.equal(resultDesc[4].id, "b-end");
  });

  await t.test("interleave: preserves blanks at start, middle, and end", () => {
    const original = [
      { id: "b-start", isBlank: true },
      { id: "a1", fileIndex: 0, pageIndex: 0 },
      { id: "a2", fileIndex: 0, pageIndex: 1 },
      { id: "b-mid", isBlank: true },
      { id: "b1", fileIndex: 1, pageIndex: 0 },
      { id: "b2", fileIndex: 1, pageIndex: 1 },
      { id: "b-end", isBlank: true },
    ];
    // Round-robin interleaved non-blanks: a1, b1, a2, b2
    const interleaved = [
      { id: "a1", fileIndex: 0, pageIndex: 0 },
      { id: "b1", fileIndex: 1, pageIndex: 0 },
      { id: "a2", fileIndex: 0, pageIndex: 1 },
      { id: "b2", fileIndex: 1, pageIndex: 1 },
    ];
    const result = reinsertBlanksAtRelativePositions(original, interleaved);
    assert.equal(result.length, 7);
    assert.equal(result[0].id, "b-start");
    assert.equal(result[6].id, "b-end");
    // b-mid should be placed after 2 non-blanks (a1, b1)
    assert.equal(result[3].id, "b-mid");
  });

  await t.test("remove file/page: preserves blanks at relative positions", () => {
    const original = [
      { id: "b-start", isBlank: true },
      { id: "p1" },
      { id: "p2" },
      { id: "b-mid", isBlank: true },
      { id: "p3" },
      { id: "p4" },
      { id: "b-end", isBlank: true },
    ];
    // Remove p2, p3, p4 -> leaves p1
    const remaining = [{ id: "p1" }];
    const result = reinsertBlanksAtRelativePositions(original, remaining);
    assert.equal(result.length, 4);
    assert.equal(result[0].id, "b-start");
    assert.equal(result[1].id, "p1");
    assert.equal(result[2].id, "b-mid");
    assert.equal(result[3].id, "b-end");
  });

  await t.test("inherits page size/orientation from neighboring pages (portrait and landscape)", async () => {
    // Create doc with page 1: Letter Portrait [612, 792], page 2: Landscape [800, 500]
    const docMixed = await PDFDocument.create();
    const p1 = docMixed.addPage([612, 792]);
    p1.drawText("Letter Portrait");
    const p2 = docMixed.addPage([800, 500]);
    p2.drawText("Landscape");
    const mixedBytes = await docMixed.save();

    const pages = [
      { isBlank: true }, // at start: should inherit from page 0 (Letter [612, 792])
      { fileIndex: 0, pageIndex: 0 },
      { isBlank: true }, // in middle: should inherit from preceding page 0 (Letter [612, 792])
      { fileIndex: 0, pageIndex: 1 },
      { isBlank: true }, // at end: should inherit from preceding page 1 (Landscape [800, 500])
    ];

    const results = await organizeMod.run([
      { name: "mixed.pdf", data: mixedBytes },
    ], { pages }, ctx);

    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPageCount(), 5);

    const size0 = doc.getPage(0).getSize();
    assert.equal(size0.width, 612);
    assert.equal(size0.height, 792);

    const size1 = doc.getPage(1).getSize();
    assert.equal(size1.width, 612);
    assert.equal(size1.height, 792);

    const size2 = doc.getPage(2).getSize();
    assert.equal(size2.width, 612);
    assert.equal(size2.height, 792);

    const size3 = doc.getPage(3).getSize();
    assert.equal(size3.width, 800);
    assert.equal(size3.height, 500);

    const size4 = doc.getPage(4).getSize();
    assert.equal(size4.width, 800);
    assert.equal(size4.height, 500);
  });

  await t.test("honors explicit width, height, and rotation on blank pages", async () => {
    const pages = [
      { isBlank: true, width: 400, height: 600, rotation: 90 },
      { fileIndex: 0, pageIndex: 0 },
      { isBlank: true, rotation: 180 },
    ];

    const results = await organizeMod.run([
      { name: "docA.pdf", data: pdfA },
    ], { pages }, ctx);

    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPageCount(), 3);

    const page0 = doc.getPage(0);
    assert.equal(page0.getSize().width, 400);
    assert.equal(page0.getSize().height, 600);
    assert.equal(page0.getRotation().angle, 90);

    const page2 = doc.getPage(2);
    assert.equal(page2.getRotation().angle, 180);
  });
});

test("mod-extract", async (t) => {
  const samplePdf = await createSamplePdf(6); // 6 pages (0 to 5)
  const ctx = { signal: new AbortController().signal, onProgress: () => {} };

  await t.test("extracts specific page ranges merged into one PDF", async () => {
    const results = await extractMod.run(
      [{ name: "my-doc.pdf", data: samplePdf }],
      { mode: "select", pages: "1-2, 5", mergeAll: true },
      ctx
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].name, "my-doc-extracted.pdf");
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPageCount(), 3);
  });

  await t.test("extracts pages as separate individual PDFs", async () => {
    const results = await extractMod.run(
      [{ name: "my-doc.pdf", data: samplePdf }],
      { mode: "select", pages: "2, 4", mergeAll: false },
      ctx
    );

    assert.equal(results.length, 2);
    assert.equal(results[0].name, "my-doc-page2.pdf");
    assert.equal(results[1].name, "my-doc-page4.pdf");
    const doc1 = await PDFDocument.load(results[0].data);
    assert.equal(doc1.getPageCount(), 1);
    const doc2 = await PDFDocument.load(results[1].data);
    assert.equal(doc2.getPageCount(), 1);
  });

  await t.test("extracts all pages when mode is all", async () => {
    const results = await extractMod.run(
      [{ name: "my-doc.pdf", data: samplePdf }],
      { mode: "all", mergeAll: false },
      ctx
    );

    assert.equal(results.length, 6);
    assert.equal(results[0].name, "my-doc-page1.pdf");
    assert.equal(results[5].name, "my-doc-page6.pdf");
  });

  await t.test("supports custom outputName for merged extraction", async () => {
    const results = await extractMod.run(
      [{ name: "doc.pdf", data: samplePdf }],
      { mode: "select", pages: "1, 3", mergeAll: true, outputName: "custom-extracted" },
      ctx
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].name, "custom-extracted.pdf");
  });

  await t.test("supports page numbers array", async () => {
    const results = await extractMod.run(
      [{ name: "doc.pdf", data: samplePdf }],
      { mode: "select", pages: [0, 2, 4], mergeAll: true },
      ctx
    );

    assert.equal(results.length, 1);
    const doc = await PDFDocument.load(results[0].data);
    assert.equal(doc.getPageCount(), 3);
  });

  await t.test("throws error when no pages are selected", async () => {
    await assert.rejects(async () => {
      await extractMod.run(
        [{ name: "doc.pdf", data: samplePdf }],
        { mode: "select", pages: "" },
        ctx
      );
    }, /No pages selected/);
  });
});

test("UI regression: OrganizeTool blank page validation and deletion down to zero real pages", async (t) => {
  let files = [{ id: "f1", name: "docA.pdf" }];
  let pages = [
    { id: "p1", fileId: "f1", fileIndex: 0, pageIndex: 0, rotation: 0, isBlank: false },
    { id: "b1", fileId: "blank", fileIndex: -1, pageIndex: -1, rotation: 0, isBlank: true },
  ];
  let error = "";
  let runStarted = false;

  const hasRealPages = () => pages.some((p) => !p.isBlank);
  const isRunDisabled = () => files.length === 0 || pages.length === 0 || !hasRealPages();

  function handleDeletePage(pageIdx) {
    if (pages.length <= 1) {
      error = "A PDF document must have at least one page.";
      return;
    }
    const remaining = pages.filter((_, idx) => idx !== pageIdx);
    if (!remaining.some((p) => !p.isBlank)) {
      error = "At least one real page is required.";
    } else {
      error = "";
    }
    pages = remaining;
  }

  function handleRemoveFile(fileIdxToRemove) {
    const fileToRemove = files[fileIdxToRemove];
    if (!fileToRemove) return;

    if (files.length <= 1) {
      files = [];
      pages = [];
      error = "";
      return;
    }

    const updatedFiles = files.filter((_, idx) => idx !== fileIdxToRemove);
    const remainingPages = pages.filter((p) => p.fileId !== fileToRemove.id);

    if (!remainingPages.some((p) => !p.isBlank)) {
      error = "At least one real page is required.";
    } else {
      error = "";
    }

    files = updatedFiles;
    pages = remainingPages;
  }

  function run() {
    if (files.length === 0 || pages.length === 0 || !hasRealPages()) {
      if (!hasRealPages() && pages.length > 0) {
        error = "At least one real page is required.";
      }
      return;
    }
    error = "";
    runStarted = true;
  }

  await t.test("deleting down to one blank and zero real pages disables Run and sets error", () => {
    assert.equal(hasRealPages(), true);
    assert.equal(isRunDisabled(), false);

    // Delete the only real page (index 0)
    handleDeletePage(0);

    assert.equal(pages.length, 1);
    assert.equal(pages[0].isBlank, true);
    assert.equal(hasRealPages(), false);
    assert.equal(isRunDisabled(), true);
    assert.equal(error, "At least one real page is required.");

    // Attempting to run should be a no-op and preserve error
    run();
    assert.equal(runStarted, false);
    assert.equal(error, "At least one real page is required.");

    // Attempting to delete the last remaining blank page should trigger the 1-page guard
    handleDeletePage(0);
    assert.equal(error, "A PDF document must have at least one page.");
    assert.equal(pages.length, 1);
  });

  await t.test("adding a real page re-enables Run and clears error", () => {
    pages.push({ id: "p2", fileId: "f1", fileIndex: 0, pageIndex: 1, rotation: 0, isBlank: false });
    error = "";

    assert.equal(hasRealPages(), true);
    assert.equal(isRunDisabled(), false);
    assert.equal(error, "");

    run();
    assert.equal(runStarted, true);
  });

  await t.test("removing a file that leaves only blank pages sets error and disables Run", () => {
    // 2 files: f1 and f2
    files = [{ id: "f1", name: "docA.pdf" }, { id: "f2", name: "docB.pdf" }];
    pages = [
      { id: "p2", fileId: "f2", fileIndex: 1, pageIndex: 0, rotation: 0, isBlank: false },
      { id: "b1", fileId: "blank", fileIndex: -1, pageIndex: -1, rotation: 0, isBlank: true },
    ];
    error = "";
    runStarted = false;

    // Remove file f2 (index 1) which holds the only real page
    handleRemoveFile(1);

    assert.equal(files.length, 1);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].isBlank, true);
    assert.equal(hasRealPages(), false);
    assert.equal(isRunDisabled(), true);
    assert.equal(error, "At least one real page is required.");

    run();
    assert.equal(runStarted, false);
  });
});

// ─────────────────────────────────────────────────────────────
// UI regression: ExtractTool selection and mode switching (Issue #20)
// ─────────────────────────────────────────────────────────────
test("UI regression: ExtractTool selection and mode switching", async (t) => {
  const totalPages = 5;
  let extractMode = "all";
  let selectedPages = new Set([1, 2, 3, 4, 5]);
  let pagesInput = "1-5";

  function handleTogglePage(pageNum) {
    const base =
      extractMode === "all" && selectedPages.size !== totalPages
        ? new Set(Array.from({ length: totalPages }, (_, i) => i + 1))
        : selectedPages;
    const next = new Set(base);
    if (next.has(pageNum)) {
      next.delete(pageNum);
    } else {
      next.add(pageNum);
    }
    selectedPages = next;
    pagesInput = formatPageRanges(Array.from(next));
    extractMode = "select";
  }

  function handleSelectAllPagesMode() {
    extractMode = "all";
    const all = new Set(Array.from({ length: totalPages }, (_, i) => i + 1));
    selectedPages = all;
    pagesInput = formatPageRanges(Array.from(all));
  }

  function handleCustomSelectMode() {
    extractMode = "select";
  }

  function handlePagesInputChange(val) {
    pagesInput = val;
    selectedPages = parsePageRanges(val, totalPages);
    extractMode = "select";
  }

  await t.test("clicking thumbnail in all mode switches to select mode and deselects clicked card", () => {
    // Start in "all" mode with all pages selected
    handleSelectAllPagesMode();
    assert.equal(extractMode, "all");
    assert.equal(selectedPages.size, 5);
    assert.equal(pagesInput, "1-5");

    // Click card 3
    handleTogglePage(3);

    // Mode must immediately switch to select, card 3 deselected, range input updated
    assert.equal(extractMode, "select");
    assert.equal(selectedPages.has(3), false);
    assert.equal(selectedPages.size, 4);
    assert.equal(pagesInput, "1-2, 4-5");

    // Click card 1
    handleTogglePage(1);
    assert.equal(extractMode, "select");
    assert.equal(selectedPages.has(1), false);
    assert.equal(selectedPages.size, 3);
    assert.equal(pagesInput, "2, 4-5");
  });

  await t.test("switching from select to all resets selection to all pages and syncs range input", () => {
    // Currently only pages 2, 4, 5 selected in select mode
    assert.equal(extractMode, "select");
    assert.equal(selectedPages.size, 3);

    // Switch to "all" mode
    handleSelectAllPagesMode();
    assert.equal(extractMode, "all");
    assert.equal(selectedPages.size, 5);
    assert.equal(pagesInput, "1-5");
    assert.deepEqual(Array.from(selectedPages).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  });

  await t.test("switching from all mode to select mode preserves visible selection without hidden changes", () => {
    handleSelectAllPagesMode();
    assert.equal(extractMode, "all");
    assert.equal(selectedPages.size, 5);

    // User clicks "Select pages" tab
    handleCustomSelectMode();
    assert.equal(extractMode, "select");
    assert.equal(selectedPages.size, 5);
    assert.equal(pagesInput, "1-5");
    assert.deepEqual(Array.from(selectedPages).sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  });

  await t.test("typing into pages input switches mode to select and synchronizes selectedPages", () => {
    handleSelectAllPagesMode();
    assert.equal(extractMode, "all");

    // User types "1, 4-5"
    handlePagesInputChange("1, 4-5");
    assert.equal(extractMode, "select");
    assert.equal(selectedPages.size, 3);
    assert.deepEqual(Array.from(selectedPages).sort((a, b) => a - b), [1, 4, 5]);
  });
});
