import test from "node:test";
import assert from "node:assert/strict";
import { appendUniqueFiles, isSameFile } from "../apps/web/lib/format.ts";

test("File deduplication and unique name generation (Issue #24)", async (t) => {
  await t.test("isSameFile correctly identifies exact matches vs distinct files", () => {
    const fileA = { name: "doc.pdf", size: 1000, lastModified: 100 };
    const fileAExact = { name: "doc.pdf", size: 1000, lastModified: 100 };
    const fileADiffSize = { name: "doc.pdf", size: 2000, lastModified: 100 };
    const fileADiffTime = { name: "doc.pdf", size: 1000, lastModified: 200 };
    const fileB = { name: "other.pdf", size: 1000, lastModified: 100 };

    assert.equal(isSameFile(fileA, fileA), true, "Same reference is exact duplicate");
    assert.equal(isSameFile(fileA, fileAExact), true, "Same name, size, lastModified is exact duplicate");
    assert.equal(isSameFile(fileA, fileADiffSize), false, "Same name with different size is distinct");
    assert.equal(isSameFile(fileA, fileADiffTime), false, "Same name with different lastModified is distinct");
    assert.equal(isSameFile(fileA, fileB), false, "Different names are distinct");
  });

  await t.test("preserves distinct same-named files by assigning distinct display names", () => {
    const existing = [
      new File(["content-1"], "report.pdf", { type: "application/pdf", lastModified: 1000 }),
    ];
    const incoming = [
      new File(["different-longer-content"], "report.pdf", { type: "application/pdf", lastModified: 2000 }),
    ];

    const result = appendUniqueFiles(existing, incoming);

    assert.equal(result.length, 2, "Both files must be kept");
    assert.equal(result[0].name, "report.pdf");
    assert.equal(result[1].name, "report (1).pdf", "Second file must be given a distinct display name");
    assert.equal(result[0].size, 9);
    assert.equal(result[1].size, 24);
  });

  await t.test("filters out exact duplicates without duplicating them", () => {
    const existing = [
      new File(["content-1"], "report.pdf", { type: "application/pdf", lastModified: 1000 }),
    ];
    const incomingExactDuplicate = [
      new File(["content-1"], "report.pdf", { type: "application/pdf", lastModified: 1000 }),
    ];

    const result = appendUniqueFiles(existing, incomingExactDuplicate);

    assert.equal(result.length, 1, "Exact duplicate must be discarded");
    assert.equal(result[0].name, "report.pdf");
  });

  await t.test("handles initial selection with multiple same-named distinct files", () => {
    const incoming = [
      new File(["file1"], "data.pdf", { type: "application/pdf", lastModified: 100 }),
      new File(["file-longer-2"], "data.pdf", { type: "application/pdf", lastModified: 200 }),
      new File(["file-even-longer-3"], "data.pdf", { type: "application/pdf", lastModified: 300 }),
    ];

    const result = appendUniqueFiles([], incoming);

    assert.equal(result.length, 3);
    assert.equal(result[0].name, "data.pdf");
    assert.equal(result[1].name, "data (1).pdf");
    assert.equal(result[2].name, "data (2).pdf");
  });

  await t.test("handles multiple extensions and files without extensions", () => {
    const existing = [
      new File(["a"], "archive.tar.gz", { type: "application/octet-stream", lastModified: 100 }),
      new File(["b"], "README", { type: "text/plain", lastModified: 100 }),
    ];
    const incoming = [
      new File(["diff-a"], "archive.tar.gz", { type: "application/octet-stream", lastModified: 200 }),
      new File(["diff-b"], "README", { type: "text/plain", lastModified: 200 }),
    ];

    const result = appendUniqueFiles(existing, incoming);

    assert.equal(result.length, 4);
    assert.equal(result[0].name, "archive.tar.gz");
    assert.equal(result[1].name, "README");
    assert.equal(result[2].name, "archive.tar (1).gz");
    assert.equal(result[3].name, "README (1)");
  });
});
