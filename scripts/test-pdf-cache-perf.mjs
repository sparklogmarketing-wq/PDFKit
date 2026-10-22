import test from "node:test";
import assert from "node:assert/strict";

// Setup browser globals for Node test environment
globalThis.window = globalThis;

let getDocumentCalls = 0;
let getPageCalls = 0;
let renderCalls = 0;
let cancelCalls = 0;

function createMockPdfJs(totalPages = 50) {
  return {
    GlobalWorkerOptions: {},
    getDocument: (params) => {
      getDocumentCalls++;
      const pdfProxy = {
        numPages: totalPages,
        getPage: async (pageNum) => {
          getPageCalls++;
          return {
            getViewport: ({ scale = 1 }) => ({
              width: 200 * scale,
              height: 200 * scale,
            }),
            render: ({ canvasContext, viewport }) => {
              renderCalls++;
              let cancelled = false;
              let rejectTask;
              const promise = new Promise((resolve, reject) => {
                rejectTask = reject;
                setTimeout(() => {
                  if (!cancelled) resolve();
                }, 20);
              });

              return {
                promise,
                cancel: () => {
                  cancelled = true;
                  cancelCalls++;
                  const err = new Error("Rendering cancelled");
                  err.name = "RenderingCancelledException";
                  rejectTask(err);
                },
              };
            },
          };
        },
        destroy: () => {},
      };

      return {
        promise: Promise.resolve(pdfProxy),
      };
    },
  };
}

function createMockCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      setTransform: () => {},
      fillStyle: "",
      fillRect: () => {},
    }),
  };
}

test("PDF caching and rendering performance", async (t) => {
  const {
    getPdfInfo,
    renderPdfPage,
    clearPdfDocumentCache,
  } = await import("../apps/web/lib/pdfjs.ts");

  t.beforeEach(() => {
    getDocumentCalls = 0;
    getPageCalls = 0;
    renderCalls = 0;
    cancelCalls = 0;
    globalThis.window.pdfjsLib = createMockPdfJs(50);
    clearPdfDocumentCache();
  });

  await t.test("asserts exactly ONE getDocument call per file across N thumbnails and getPdfInfo", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "large-document.pdf");
    const N = 25; // simulate 25 thumbnails

    // 1. Initial info query
    const info = await getPdfInfo(file);
    assert.equal(info?.numPages, 50);
    assert.equal(getDocumentCalls, 1, "getDocument should be called once on info fetch");

    // 2. Render N thumbnails concurrently
    const renderPromises = [];
    for (let i = 1; i <= N; i++) {
      const canvas = createMockCanvas();
      renderPromises.push(renderPdfPage(file, canvas, i, 160));
    }

    const results = await Promise.all(renderPromises);
    assert.equal(results.length, N);
    for (const res of results) {
      assert.equal(res?.numPages, 50);
    }

    // 3. Verify getDocument was called ONLY ONCE
    assert.equal(
      getDocumentCalls,
      1,
      `Expected getDocument to be called exactly 1 time across all ${N} thumbnails, but was called ${getDocumentCalls} times.`
    );
    assert.equal(renderCalls, N, `All ${N} thumbnails rendered`);
  });

  await t.test("page count is derived from cached document, not a second parse", async () => {
    const file = new File([new Uint8Array([4, 5, 6])], "doc2.pdf");

    // Render page 1
    const canvas = createMockCanvas();
    const res = await renderPdfPage(file, canvas, 1, 160);
    assert.equal(res?.numPages, 50);
    assert.equal(getDocumentCalls, 1);

    // Call getPdfInfo
    const info = await getPdfInfo(file);
    assert.equal(info?.numPages, 50);

    // Assert getDocument was not called a second time
    assert.equal(getDocumentCalls, 1, "Page count should be derived from cached document");
  });

  await t.test("separate files each get parsed at most once", async () => {
    const fileA = new File([new Uint8Array([1])], "fileA.pdf");
    const fileB = new File([new Uint8Array([2])], "fileB.pdf");

    await getPdfInfo(fileA);
    await getPdfInfo(fileA);
    await renderPdfPage(fileA, createMockCanvas(), 1, 160);

    await getPdfInfo(fileB);
    await renderPdfPage(fileB, createMockCanvas(), 1, 160);
    await renderPdfPage(fileB, createMockCanvas(), 2, 160);

    assert.equal(getDocumentCalls, 2, "Each file should be parsed exactly once");
  });

  await t.test("unmounted thumbnails cancel their render tasks: in-queue pruning and in-flight cancel", async () => {
    const file = new File([new Uint8Array([9])], "cancel-test.pdf");

    // 1. In-flight abort: priority render is started, then aborted while renderTask is in progress
    const controllerActive = new AbortController();
    const canvasActive = createMockCanvas();
    const activePromise = renderPdfPage(file, canvasActive, 1, 160, {
      priority: true,
      signal: controllerActive.signal,
    });

    // Let page loading begin, then abort during active render
    await new Promise((r) => setTimeout(r, 5));
    controllerActive.abort();

    const activeResult = await activePromise;
    assert.equal(activeResult, null, "Aborted in-flight render should resolve to null");
    assert.ok(cancelCalls >= 1, "renderTask.cancel should be called on in-flight abort");

    // 2. In-queue pruning: queue thumbnail then abort before it runs
    const controllerQueued = new AbortController();
    const queuedPromise = renderPdfPage(file, createMockCanvas(), 2, 160, {
      signal: controllerQueued.signal,
    });
    controllerQueued.abort();

    const queuedResult = await queuedPromise;
    assert.equal(queuedResult, null, "Aborted queued render should resolve to null immediately");
  });

  await t.test("zoom rendering does not wait for all thumbnail renders", async () => {
    const file = new File([new Uint8Array([10])], "priority-test.pdf");
    const order = [];

    // Queue 5 thumbnail renders
    for (let i = 1; i <= 5; i++) {
      const canvas = createMockCanvas();
      renderPdfPage(file, canvas, i, 160).then(() => {
        order.push(`thumb-${i}`);
      });
    }

    // Immediately trigger a priority Zoom render
    const zoomCanvas = createMockCanvas();
    const zoomPromise = renderPdfPage(file, zoomCanvas, 10, 1100, {
      priority: true,
    }).then(() => {
      order.push("zoom");
    });

    await zoomPromise;

    // Zoom should finish first (or ahead of the full queue of thumbnails)
    assert.ok(order.includes("zoom"));
    const zoomIdx = order.indexOf("zoom");
    assert.ok(
      zoomIdx <= 2,
      `Zoom render should execute immediately with high priority, finished at index ${zoomIdx} of ${order.length}`
    );
  });
});
