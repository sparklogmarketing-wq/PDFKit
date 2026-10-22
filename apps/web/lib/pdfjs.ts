let pdfjsPromise: Promise<any> | null = null;
let documentCache = new WeakMap<File, Promise<any>>();
let pageCountCache = new WeakMap<File, number>();

export interface RenderPdfPageOptions {
  /**
   * If true, the render bypasses the thumbnail queue and executes immediately
   * (e.g. for Zoom modal interactions).
   */
  priority?: boolean;
  /**
   * Optional AbortSignal to cancel rendering if the component unmounts
   * or scrolls out of view.
   */
  signal?: AbortSignal;
}

export function clearPdfDocumentCache(): void {
  documentCache = new WeakMap<File, Promise<any>>();
  pageCountCache = new WeakMap<File, number>();
  thumbnailQueue.length = 0;
}

export function resetPdfJs(): void {
  pdfjsPromise = null;
  clearPdfDocumentCache();
  if (typeof window !== "undefined") {
    delete (window as any).pdfjsLib;
  }
}

export function getPdfJs(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PDF.js can only be loaded in the browser"));
  }
  if ((window as any).pdfjsLib) {
    return Promise.resolve((window as any).pdfjsLib);
  }
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      try {
        let lib: any;
        try {
          // Dynamic import of self-hosted ES module in the browser
          const vendorUrl = "/vendor/pdf.min.mjs";
          // @ts-ignore - runtime browser path served from public/vendor/
          lib = await import(/* webpackIgnore: true */ vendorUrl);
        } catch {
          // Fallback to script tag if dynamic import is not available
          lib = await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.type = "module";
            script.src = "/vendor/pdf.min.mjs";
            script.onload = () => {
              const loaded = (window as any).pdfjsLib;
              if (loaded) resolve(loaded);
              else reject(new Error("pdfjsLib not defined after loading script"));
            };
            script.onerror = () => reject(new Error("Failed to load /vendor/pdf.min.mjs"));
            document.head.appendChild(script);
          });
        }

        const resolvedLib = (window as any).pdfjsLib || lib?.default || lib;
        if (!resolvedLib) {
          throw new Error("PDF.js library could not be loaded");
        }
        resolvedLib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
        (window as any).pdfjsLib = resolvedLib;
        return resolvedLib;
      } catch (err) {
        // Reset cached promise so subsequent attempts can retry
        pdfjsPromise = null;
        throw err;
      }
    })();
  }
  return pdfjsPromise;
}

/**
 * Retrieves or caches a single parsed PDFDocumentProxy per File.
 * Subsequent calls for the same File return the exact same promise.
 */
export function getOrLoadPdfDocument(file: File): Promise<any> {
  const cached = documentCache.get(file);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const pdfjs = await getPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    pageCountCache.set(file, pdf.numPages);
    return pdf;
  })().catch((err) => {
    documentCache.delete(file);
    throw err;
  });

  documentCache.set(file, promise);
  return promise;
}

/** Direct uncached document loader for isolated operations if needed */
export async function loadPdfDocumentDirect(data: Uint8Array): Promise<any> {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
  });
  return await loadingTask.promise;
}

/** Quickly extract number of pages from cached document without duplicate parses */
export async function getPdfInfo(file: File): Promise<{ numPages: number } | null> {
  try {
    const cachedCount = pageCountCache.get(file);
    if (typeof cachedCount === "number") {
      return { numPages: cachedCount };
    }
    const pdf = await getOrLoadPdfDocument(file);
    return { numPages: pdf.numPages };
  } catch (err) {
    console.error("Failed to get PDF info:", err);
    return null;
  }
}

/** Efficiently fetch page counts for any files not already present in the map */
export async function loadPdfPagesMap(
  files: readonly File[],
  currentMap: Record<string, number>
): Promise<Record<string, number>> {
  const missing = files.filter((f) => !currentMap[f.name]);
  if (missing.length === 0) return currentMap;
  const infos = await Promise.all(missing.map((f) => getPdfInfo(f)));
  const updated = { ...currentMap };
  missing.forEach((f, idx) => {
    updated[f.name] = infos[idx]?.numPages ?? 1;
  });
  return updated;
}

/* ── Priority-Aware Throttled Render Scheduler ───────────────── */

interface QueuedRender {
  signal?: AbortSignal;
  run: () => Promise<void>;
  reject: (err: any) => void;
}

let activeThumbnailRenders = 0;
const MAX_CONCURRENT_THUMBNAILS = 2;
const thumbnailQueue: QueuedRender[] = [];

function pumpThumbnailQueue(): void {
  while (activeThumbnailRenders < MAX_CONCURRENT_THUMBNAILS && thumbnailQueue.length > 0) {
    const next = thumbnailQueue.shift()!;
    if (next.signal?.aborted) {
      continue;
    }
    activeThumbnailRenders++;
    void next.run().finally(() => {
      activeThumbnailRenders--;
      pumpThumbnailQueue();
    });
  }
}

async function executeRender(
  file: File,
  canvas: HTMLCanvasElement,
  pageNumber: number,
  targetWidth: number,
  signal?: AbortSignal
): Promise<{ numPages: number } | null> {
  if (signal?.aborted) {
    return null;
  }

  try {
    const pdf = await getOrLoadPdfDocument(file);
    if (signal?.aborted) {
      return null;
    }

    const numPages = pdf.numPages;
    const page = await pdf.getPage(Math.min(pageNumber, numPages));
    if (signal?.aborted) {
      return null;
    }

    const initialViewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / initialViewport.width;
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return { numPages };

    // Ensure transform is clean identity and background is clean white
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    });

    if (signal) {
      if (signal.aborted) {
        try {
          renderTask.cancel();
        } catch (_) {}
        return null;
      }
      signal.addEventListener(
        "abort",
        () => {
          try {
            renderTask.cancel();
          } catch (_) {}
        },
        { once: true }
      );
    }

    await renderTask.promise;

    // Reset transform after rendering
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    return { numPages };
  } catch (err: any) {
    if (err?.name === "RenderingCancelledException" || signal?.aborted) {
      return null;
    }
    console.error("Failed to render PDF page:", err);
    return null;
  }
}

/**
 * Renders a PDF page to a canvas.
 * - Reuses the cached PDFDocumentProxy for the File.
 * - Zoom modal renders (`priority: true`) run immediately without waiting behind thumbnails.
 * - Background thumbnail renders are throttled and support abort cancellation on unmount/scroll.
 */
export async function renderPdfPage(
  file: File,
  canvas: HTMLCanvasElement,
  pageNumber = 1,
  targetWidth = 360,
  options?: RenderPdfPageOptions
): Promise<{ numPages: number } | null> {
  const signal = options?.signal;
  const isPriority = options?.priority === true;

  if (signal?.aborted) {
    return null;
  }

  // Priority renders (e.g. Zoom modal) run immediately without waiting in thumbnail queue
  if (isPriority) {
    return executeRender(file, canvas, pageNumber, targetWidth, signal);
  }

  // Thumbnail renders are queued and throttled
  return new Promise<{ numPages: number } | null>((resolve, reject) => {
    let executed = false;

    const task: QueuedRender = {
      signal,
      run: async () => {
        executed = true;
        try {
          const res = await executeRender(file, canvas, pageNumber, targetWidth, signal);
          resolve(res);
        } catch (err) {
          reject(err);
        }
      },
      reject,
    };

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          if (!executed) {
            const idx = thumbnailQueue.indexOf(task);
            if (idx !== -1) {
              thumbnailQueue.splice(idx, 1);
            }
            resolve(null);
          }
        },
        { once: true }
      );
    }

    thumbnailQueue.push(task);
    pumpThumbnailQueue();
  });
}
