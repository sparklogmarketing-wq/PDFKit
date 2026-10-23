import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "@cantoo/pdf-lib";
import { parsePageSpec, ToolError } from "../packages/core/src/index.ts";
import mergeMod from "../packages/mod-merge/src/index.ts";
import splitMod from "../packages/mod-split/src/index.ts";
import rotateMod from "../packages/mod-rotate/src/index.ts";
import removeMod from "../packages/mod-remove/src/index.ts";
import organizeMod from "../packages/mod-organize/src/index.ts";
import extractMod from "../packages/mod-extract/src/index.ts";
import "./test-cancellation.mjs";
import "./test-pdf-cache-perf.mjs";
import "./test-stale-async.mjs";

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

