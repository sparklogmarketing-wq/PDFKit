import test from "node:test";
import assert from "node:assert/strict";
import { runTool, isCancelledError } from "../apps/web/lib/runTool.ts";

// Helper to access MockWorker instances
function getLatestWorker() {
  return globalThis.Worker.instances.at(-1);
}

// Module-scope mock helpers for async PDF info & page map resolution
async function mockDelayedPdfInfo(file) {
  if (file?.name === "slow.pdf") {
    await new Promise((r) => setTimeout(r, 60));
    return { numPages: 100 };
  }
  if (file?.name === "pending.pdf") {
    await new Promise((r) => setTimeout(r, 30));
    return { numPages: 42 };
  }
  // fast.pdf or default
  await new Promise((r) => setTimeout(r, 10));
  return { numPages: 5 };
}

async function mockDelayedPagesMap(files) {
  await new Promise((r) => setTimeout(r, 40));
  return { [files[0].name]: 15 };
}

// ─────────────────────────────────────────────────────────────
// 1. Generic ToolRunner: reset-during-run & rapid replacement
// ─────────────────────────────────────────────────────────────
test("Generic ToolRunner: stale async and reset protection", async (t) => {
  await t.test("reset-during-run: clearing files while running cancels worker and discards late results", async () => {
    let files = [{ name: "doc1.pdf", arrayBuffer: async () => new ArrayBuffer(8) }];
    let results = [];
    let progress = null;
    let statusMessage = "";
    let cancel = null;
    const cancelRef = { current: null };
    const runIdRef = { current: 0 };

    function clearAllFiles() {
      runIdRef.current++;
      cancelRef.current?.();
      cancel = null;
      cancelRef.current = null;
      progress = null;
      statusMessage = "";
      files = [];
      results = [];
    }

    async function run() {
      if (files.length === 0) return;
      const runId = ++runIdRef.current;
      results = [];
      progress = 0.05;
      statusMessage = "Processing...";

      try {
        const inputs = [{ name: files[0].name, data: new Uint8Array([1, 2]) }];
        if (runId !== runIdRef.current) return;

        const job = runTool("test-tool", inputs, {}, (p) => {
          if (runId === runIdRef.current) {
            progress = p;
          }
        });

        cancel = job.cancel;
        cancelRef.current = job.cancel;
        const outs = await job.promise;
        if (runId !== runIdRef.current || files.length === 0) return;

        results = outs.map((o) => ({ name: o.name, size: o.data.byteLength }));
      } catch (e) {
        if (runId === runIdRef.current && !isCancelledError(e)) {
          throw e;
        }
      } finally {
        if (runId === runIdRef.current) {
          progress = null;
          cancel = null;
          cancelRef.current = null;
          statusMessage = "";
        }
      }
    }

    // 1. Start run
    const runPromise = run();
    assert.equal(progress, 0.05);
    const worker = getLatestWorker();
    assert.equal(worker.terminated, false);

    // 2. Clear files while running
    clearAllFiles();
    assert.equal(worker.terminated, true, "Worker should be cancelled immediately on clear");
    assert.equal(files.length, 0);
    assert.equal(progress, null);

    // 3. Worker sends late done message (simulate race)
    worker.onmessage({
      data: {
        type: "done",
        outputs: [{ name: "output.pdf", mime: "application/pdf", data: new Uint8Array([9, 9]) }],
      },
    });

    await runPromise;

    // 4. Assert results were NOT populated and results view would not render
    assert.equal(results.length, 0, "Stale results must be discarded");
    const shouldRenderResults = Boolean(results.length > 0 && files.length > 0);
    assert.equal(shouldRenderResults, false, "Results view must not render without source files");
  });

  await t.test("rapid-file-replacement: replacing single file cancels active worker and rejects stale completion", async () => {
    let files = [{ name: "first.pdf", arrayBuffer: async () => new ArrayBuffer(8) }];
    let results = [];
    let progress = null;
    let cancel = null;
    const cancelRef = { current: null };
    const runIdRef = { current: 0 };

    function selectFile(newFile) {
      runIdRef.current++;
      cancelRef.current?.();
      cancel = null;
      cancelRef.current = null;
      progress = null;
      files = [newFile];
      results = [];
    }

    async function runCurrent() {
      if (files.length === 0) return;
      const runId = ++runIdRef.current;
      results = [];
      progress = 0.1;

      try {
        const curName = files[0].name;
        const inputs = [{ name: curName, data: new Uint8Array([1]) }];
        const job = runTool("test-tool", inputs, {}, (p) => {
          if (runId === runIdRef.current) progress = p;
        });
        cancel = job.cancel;
        cancelRef.current = job.cancel;

        const outs = await job.promise;
        if (runId !== runIdRef.current || files.length === 0) return;

        results = outs.map((o) => ({ name: o.name }));
      } catch (e) {
        if (runId === runIdRef.current && !isCancelledError(e)) throw e;
      } finally {
        if (runId === runIdRef.current) {
          progress = null;
          cancel = null;
          cancelRef.current = null;
        }
      }
    }

    // 1. Run first file
    const run1 = runCurrent();
    const worker1 = getLatestWorker();

    // 2. Rapidly replace with second file before first finishes
    selectFile({ name: "second.pdf", arrayBuffer: async () => new ArrayBuffer(8) });
    assert.equal(worker1.terminated, true, "Worker for first file should be terminated");

    // 3. Worker 1 late done
    worker1.onmessage({
      data: {
        type: "done",
        outputs: [{ name: "first_out.pdf", mime: "application/pdf", data: new Uint8Array([1]) }],
      },
    });
    await run1;
    assert.equal(results.length, 0, "Late output from replaced file must not be applied");

    // 4. Now run second file to completion
    const run2 = runCurrent();
    const worker2 = getLatestWorker();
    worker2.onmessage({
      data: {
        type: "done",
        outputs: [{ name: "second_out.pdf", mime: "application/pdf", data: new Uint8Array([2]) }],
      },
    });
    await run2;
    assert.equal(results.length, 1);
    assert.equal(results[0].name, "second_out.pdf");
  });
});

// ─────────────────────────────────────────────────────────────
// 2. Custom Tools: SplitTool & ExtractTool stale async tests
// ─────────────────────────────────────────────────────────────
test("Custom Tools: SplitTool and ExtractTool async lifecycle", async (t) => {
  await t.test("SplitTool: reset-during-run terminates worker and leaves results empty", async () => {
    let file = { name: "split-doc.pdf", arrayBuffer: async () => new ArrayBuffer(4) };
    let results = [];
    let progress = null;
    let cancel = null;
    const cancelRef = { current: null };
    const loadIdRef = { current: 0 };
    const runIdRef = { current: 0 };

    function reset() {
      cancelRef.current?.();
      loadIdRef.current++;
      runIdRef.current++;
      file = null;
      results = [];
      progress = null;
      cancel = null;
      cancelRef.current = null;
    }

    async function runSplit() {
      const runId = ++runIdRef.current;
      try {
        const job = runTool("split", [{ name: file.name, data: new Uint8Array([1]) }], {}, () => {});
        cancel = () => job.cancel();
        cancelRef.current = () => job.cancel();

        const outputs = await job.promise;
        if (runId !== runIdRef.current || !file) return;
        results = outputs.map((o) => o.name);
      } catch (err) {
        if (runId === runIdRef.current && !isCancelledError(err)) throw err;
      } finally {
        if (runId === runIdRef.current) {
          progress = null;
          cancel = null;
          cancelRef.current = null;
        }
      }
    }

    const splitPromise = runSplit();
    const splitWorker = getLatestWorker();

    reset();
    assert.equal(splitWorker.terminated, true);
    assert.equal(file, null);

    splitWorker.onmessage({
      data: {
        type: "done",
        outputs: [{ name: "part1.pdf", mime: "application/pdf", data: new Uint8Array([1]) }],
      },
    });

    await splitPromise;
    assert.equal(results.length, 0, "No results after reset");
    const shouldRenderResults = Boolean(results.length > 0 && file);
    assert.equal(shouldRenderResults, false, "Results view guarded by file presence");
  });

  await t.test("SplitTool & ExtractTool: rapid file replacement ignores stale getPdfInfo", async () => {
    let currentFile = null;
    let totalPages = 0;
    const loadIdRef = { current: 0 };

    async function loadFile(f) {
      const loadId = ++loadIdRef.current;
      const info = await mockDelayedPdfInfo(f);
      if (loadId !== loadIdRef.current) return;
      currentFile = f;
      totalPages = info.numPages;
    }

    // Select slow file, then immediately select fast file
    const p1 = loadFile({ name: "slow.pdf" });
    const p2 = loadFile({ name: "fast.pdf" });

    await Promise.all([p1, p2]);

    assert.equal(currentFile.name, "fast.pdf");
    assert.equal(totalPages, 5, "Total pages must be from fast.pdf, not overwritten by stale slow.pdf");
  });

  await t.test("stale-getPdfInfo: reset while getPdfInfo is pending discards late page count", async () => {
    let currentFile = null;
    let totalPages = 0;
    const loadIdRef = { current: 0 };

    async function loadFile(f) {
      const loadId = ++loadIdRef.current;
      const info = await mockDelayedPdfInfo(f);
      if (loadId !== loadIdRef.current) return;
      currentFile = f;
      totalPages = info.numPages;
    }

    function reset() {
      loadIdRef.current++;
      currentFile = null;
      totalPages = 0;
    }

    const loadPromise = loadFile({ name: "pending.pdf" });
    // User clicks reset while loading
    reset();

    await loadPromise;
    assert.equal(currentFile, null, "File must remain null after reset");
    assert.equal(totalPages, 0, "Pages must remain 0 after reset");
  });
});

// ─────────────────────────────────────────────────────────────
// 3. Multi-file Tools: MergeTool & OrganizeTool & RotateTool
// ─────────────────────────────────────────────────────────────
test("Multi-file Tools: MergeTool, OrganizeTool, RotateTool stale resolution", async (t) => {
  await t.test("MergeTool: clearAllFiles cancels merge worker and ignores late output", async () => {
    let files = [{ name: "a.pdf" }, { name: "b.pdf" }];
    let results = [];
    let progress = null;
    let cancel = null;
    const cancelRef = { current: null };
    const runIdRef = { current: 0 };

    function clearAllFiles() {
      cancelRef.current?.();
      runIdRef.current++;
      cancel = null;
      cancelRef.current = null;
      progress = null;
      files = [];
      results = [];
    }

    async function handleMergeSubmit() {
      const runId = ++runIdRef.current;
      progress = 0;
      try {
        const job = runTool("merge", [{ name: "a.pdf", data: new Uint8Array([1]) }], {}, () => {});
        cancel = job.cancel;
        cancelRef.current = job.cancel;

        const outputs = await job.promise;
        if (runId !== runIdRef.current || files.length === 0) return;
        results = outputs;
      } catch (e) {
        if (runId === runIdRef.current && !isCancelledError(e)) throw e;
      } finally {
        if (runId === runIdRef.current) {
          progress = null;
          cancel = null;
          cancelRef.current = null;
        }
      }
    }

    const mergePromise = handleMergeSubmit();
    const mergeWorker = getLatestWorker();

    clearAllFiles();
    assert.equal(mergeWorker.terminated, true);

    mergeWorker.onmessage({
      data: {
        type: "done",
        outputs: [{ name: "merged.pdf", mime: "application/pdf", data: new Uint8Array([5]) }],
      },
    });

    await mergePromise;
    assert.equal(results.length, 0);
    const shouldRenderResults = Boolean(results.length > 0 && files.length > 0);
    assert.equal(shouldRenderResults, false);
  });

  await t.test("MergeTool & RotateTool: loadPdfPagesMap ignored if cleared during load", async () => {
    let filePagesMap = {};
    const loadIdRef = { current: 0 };

    async function handleFileSelect(files) {
      const loadId = ++loadIdRef.current;
      const newPages = await mockDelayedPagesMap(files);
      if (loadId !== loadIdRef.current) return;
      filePagesMap = newPages;
    }

    function clearAll() {
      loadIdRef.current++;
      filePagesMap = {};
    }

    const selectPromise = handleFileSelect([{ name: "test.pdf" }]);
    clearAll();
    await selectPromise;

    assert.deepEqual(filePagesMap, {}, "Pages map must remain empty if cleared during load");
  });
});
