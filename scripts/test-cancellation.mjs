import test from "node:test";
import assert from "node:assert/strict";
import { runTool, CancelledError, isCancelledError } from "../apps/web/lib/runTool.ts";

class MockWorker {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.terminated = false;
    this.terminateCount = 0;
    this.messages = [];
    this.onmessage = null;
    this.onerror = null;
    MockWorker.instances.push(this);
  }

  postMessage(data, transfer) {
    this.messages.push({ data, transfer });
  }

  terminate() {
    this.terminated = true;
    this.terminateCount++;
  }
}

// Install mock Worker globally
globalThis.Worker = MockWorker;

test("runTool worker-level cancellation", async (t) => {
  const dummyInputs = [{ name: "test.pdf", data: new Uint8Array([1, 2, 3]) }];

  await t.test("cancel() terminates worker and rejects promise with CancelledError exactly once", async () => {
    let progressVal = null;
    const job = runTool("test-tool", dummyInputs, {}, (p) => {
      progressVal = p;
    });

    const worker = MockWorker.instances.at(-1);
    assert.ok(worker, "Worker instance should be created");
    assert.equal(worker.terminated, false);

    // Simulate progress message
    worker.onmessage({ data: { type: "progress", p: 0.42 } });
    assert.equal(progressVal, 0.42);

    // Call cancel
    job.cancel();
    assert.equal(worker.terminated, true);
    assert.equal(worker.terminateCount, 1);

    await assert.rejects(
      job.promise,
      (err) => {
        assert.ok(err instanceof CancelledError);
        assert.ok(isCancelledError(err));
        assert.equal(err.name, "CancelledError");
        assert.equal(err.message, "Cancelled");
        return true;
      }
    );
  });

  await t.test("cancelling twice is safe and does not double-terminate or throw", async () => {
    const job = runTool("test-tool", dummyInputs, {}, () => {});
    const worker = MockWorker.instances.at(-1);

    job.cancel();
    job.cancel();

    assert.equal(worker.terminated, true);
    assert.equal(worker.terminateCount, 1);

    await assert.rejects(job.promise, CancelledError);
  });

  await t.test("cancelling after worker completes is safe and a no-op", async () => {
    const job = runTool("test-tool", dummyInputs, {}, () => {});
    const worker = MockWorker.instances.at(-1);

    worker.onmessage({
      data: {
        type: "done",
        outputs: [{ name: "out.pdf", mime: "application/pdf", data: new Uint8Array([99]) }],
      },
    });

    const result = await job.promise;
    assert.equal(result.length, 1);
    assert.equal(worker.terminated, true);
    assert.equal(worker.terminateCount, 1);

    // Calling cancel now should not re-terminate or throw
    job.cancel();
    assert.equal(worker.terminateCount, 1);
  });

  await t.test("cancelling after worker errors is safe and a no-op", async () => {
    const job = runTool("test-tool", dummyInputs, {}, () => {});
    const worker = MockWorker.instances.at(-1);

    worker.onmessage({
      data: {
        type: "error",
        message: "Worker operation failed",
      },
    });

    await assert.rejects(job.promise, /Worker operation failed/);
    assert.equal(worker.terminated, true);
    assert.equal(worker.terminateCount, 1);

    // Calling cancel now should be safe
    job.cancel();
    assert.equal(worker.terminateCount, 1);
  });
});

test("UI regression: MergeTool cancellation and immediate retry", async (t) => {
  const dummyInputs = [
    { name: "file1.pdf", data: new Uint8Array([1]) },
    { name: "file2.pdf", data: new Uint8Array([2]) },
  ];

  // Tool State simulation
  let progress = null;
  let statusMessage = "";
  let error = "";
  let results = [];
  let cancel = null;
  let objectUrlsCreated = 0;

  const mockCreateObjectURL = () => {
    objectUrlsCreated++;
    return `blob:mock-url-${objectUrlsCreated}`;
  };

  const isRunning = () => progress !== null;

  async function handleMergeSubmit() {
    if (isRunning()) return;
    error = "";
    progress = 0;
    statusMessage = "Preparing files for merging...";

    try {
      statusMessage = "Merging 2 PDFs...";
      const job = runTool("merge", dummyInputs, {}, (p) => {
        progress = p;
        statusMessage = `Merging documents... ${Math.round(p * 100)}%`;
      });

      cancel = job.cancel;
      const outputs = await job.promise;

      results = outputs.map((out) => ({
        name: "merged.pdf",
        url: mockCreateObjectURL(),
        size: out.data.byteLength,
      }));
    } catch (err) {
      if (!isCancelledError(err)) {
        error = err instanceof Error ? err.message : "An error occurred during merging.";
      }
    } finally {
      progress = null;
      statusMessage = "";
      cancel = null;
    }
  }

  await t.test("cancelling merge resets state to idle and allows immediate retry", async () => {
    // 1. Initial idle state
    assert.equal(isRunning(), false);
    assert.equal(progress, null);
    assert.equal(error, "");

    // 2. Start merge
    const submitPromise = handleMergeSubmit();
    assert.equal(isRunning(), true);
    assert.ok(cancel !== null, "Cancel callback should be active");

    const worker = MockWorker.instances.at(-1);
    worker.onmessage({ data: { type: "progress", p: 0.5 } });
    assert.equal(progress, 0.5);

    // 3. Click Cancel via ToolProgressBar
    cancel();
    await submitPromise;

    // 4. Assert idle state restored
    assert.equal(isRunning(), false, "MergeTool should no longer be running");
    assert.equal(progress, null, "Progress should be reset to null");
    assert.equal(cancel, null, "Cancel should be cleared");
    assert.equal(statusMessage, "", "Status message should be reset");
    assert.equal(error, "", "No error should be shown on cancel");
    assert.equal(results.length, 0, "No results should be produced");
    assert.equal(objectUrlsCreated, 0, "No object URLs should be leaked on cancel");

    // 5. Immediate retry
    const retryPromise = handleMergeSubmit();
    assert.equal(isRunning(), true, "Immediate retry should set running state");
    const retryWorker = MockWorker.instances.at(-1);

    retryWorker.onmessage({
      data: {
        type: "done",
        outputs: [{ name: "merged.pdf", mime: "application/pdf", data: new Uint8Array([1, 2]) }],
      },
    });

    await retryPromise;
    assert.equal(isRunning(), false);
    assert.equal(results.length, 1, "Retry should produce merged output");
    assert.equal(results[0].name, "merged.pdf");
    assert.equal(objectUrlsCreated, 1);
  });
});

test("UI regression: RotateTool cancellation and immediate retry", async (t) => {
  const dummyInputs = [{ name: "doc.pdf", data: new Uint8Array([10, 20]) }];

  let progress = null;
  let statusMsg = "";
  let error = "";
  let results = [];
  let cancel = null;
  let objectUrlsCreated = 0;

  const mockCreateObjectURL = () => {
    objectUrlsCreated++;
    return `blob:mock-url-${objectUrlsCreated}`;
  };

  const isRunning = () => progress !== null;

  async function handleRotateSubmit() {
    if (isRunning()) return;
    error = "";
    progress = 0;
    statusMsg = "Rotating 1 PDF...";

    try {
      const job = runTool("rotate", dummyInputs, { degrees: 90 }, (p) => {
        progress = Math.round(p * 100);
        statusMsg = `Processing pages... ${Math.round(p * 100)}%`;
      });

      cancel = job.cancel;
      const outputs = await job.promise;

      results = outputs.map((out) => ({
        name: out.name,
        url: mockCreateObjectURL(),
        size: out.data.byteLength,
      }));
    } catch (err) {
      if (!isCancelledError(err)) {
        error = err?.message || "An error occurred during rotation.";
      }
    } finally {
      progress = null;
      statusMsg = "";
      cancel = null;
    }
  }

  await t.test("cancelling rotate resets state to idle and allows immediate retry", async () => {
    // 1. Start rotate
    const submitPromise = handleRotateSubmit();
    assert.equal(isRunning(), true);
    assert.ok(cancel !== null);

    const worker = MockWorker.instances.at(-1);
    worker.onmessage({ data: { type: "progress", p: 0.6 } });
    assert.equal(progress, 60);

    // 2. Click cancel
    cancel();
    await submitPromise;

    // 3. Verify idle state
    assert.equal(isRunning(), false);
    assert.equal(progress, null);
    assert.equal(cancel, null);
    assert.equal(statusMsg, "");
    assert.equal(error, "");
    assert.equal(results.length, 0);
    assert.equal(objectUrlsCreated, 0);

    // 4. Immediate retry
    const retryPromise = handleRotateSubmit();
    assert.equal(isRunning(), true);
    const retryWorker = MockWorker.instances.at(-1);

    retryWorker.onmessage({
      data: {
        type: "done",
        outputs: [{ name: "doc_rotated.pdf", mime: "application/pdf", data: new Uint8Array([5]) }],
      },
    });

    await retryPromise;
    assert.equal(isRunning(), false);
    assert.equal(results.length, 1);
    assert.equal(objectUrlsCreated, 1);
  });
});

test("UI regression: RemoveTool cancellation and immediate retry", async (t) => {
  const dummyInputs = [{ name: "sample.pdf", data: new Uint8Array([50, 60]) }];

  let progress = null;
  let statusMessage = "";
  let error = "";
  let results = [];
  let cancel = null;
  let objectUrlsCreated = 0;

  const mockCreateObjectURL = () => {
    objectUrlsCreated++;
    return `blob:mock-url-${objectUrlsCreated}`;
  };

  const isRunning = () => progress !== null;

  async function handleRemoveSubmit() {
    if (isRunning()) return;
    error = "";
    progress = 0.05;
    statusMessage = "Preparing document...";

    try {
      const job = runTool("remove", dummyInputs, { pageIndices: [0] }, (p) => {
        progress = p;
        statusMessage = `Removing pages... ${Math.round(p * 100)}%`;
      });

      cancel = job.cancel;
      const outputs = await job.promise;

      results = outputs.map((item) => ({
        name: item.name,
        url: mockCreateObjectURL(),
        size: item.data.byteLength,
      }));
    } catch (err) {
      if (!isCancelledError(err)) {
        error = err instanceof Error ? err.message : "An error occurred while removing pages.";
      }
    } finally {
      progress = null;
      statusMessage = "";
      cancel = null;
    }
  }

  await t.test("cancelling remove resets state to idle and allows immediate retry", async () => {
    // 1. Start remove
    const submitPromise = handleRemoveSubmit();
    assert.equal(isRunning(), true);
    assert.ok(cancel !== null);

    const worker = MockWorker.instances.at(-1);
    worker.onmessage({ data: { type: "progress", p: 0.3 } });
    assert.equal(progress, 0.3);

    // 2. Click cancel
    cancel();
    await submitPromise;

    // 3. Verify idle state
    assert.equal(isRunning(), false);
    assert.equal(progress, null);
    assert.equal(cancel, null);
    assert.equal(statusMessage, "");
    assert.equal(error, "");
    assert.equal(results.length, 0);
    assert.equal(objectUrlsCreated, 0);

    // 4. Immediate retry
    const retryPromise = handleRemoveSubmit();
    assert.equal(isRunning(), true);
    const retryWorker = MockWorker.instances.at(-1);

    retryWorker.onmessage({
      data: {
        type: "done",
        outputs: [{ name: "sample_removed.pdf", mime: "application/pdf", data: new Uint8Array([9]) }],
      },
    });

    await retryPromise;
    assert.equal(isRunning(), false);
    assert.equal(results.length, 1);
    assert.equal(objectUrlsCreated, 1);
  });
});
