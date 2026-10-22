let pdfjsPromise: Promise<any> | null = null;

export function resetPdfJs(): void {
  pdfjsPromise = null;
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

/** Quickly extract number of pages without full page rendering */
export async function getPdfInfo(file: File): Promise<{ numPages: number } | null> {
  try {
    const pdfjs = await getPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    if (typeof pdf.destroy === "function") {
      try {
        pdf.destroy();
      } catch (_) {}
    }
    return { numPages };
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

// Queue sequential renders so parallel worker canvas operations never collide or invert
let renderQueue: Promise<any> = Promise.resolve();

export async function renderPdfPage(
  file: File,
  canvas: HTMLCanvasElement,
  pageNumber = 1,
  targetWidth = 360
): Promise<{ numPages: number } | null> {
  const doRender = async () => {
    let pdf: any = null;
    try {
      const pdfjs = await getPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(arrayBuffer),
        isEvalSupported: false,
      });
      pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      const page = await pdf.getPage(Math.min(pageNumber, numPages));

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

      await renderTask.promise;

      // Reset transform after rendering
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      return { numPages };
    } catch (err) {
      console.error("Failed to render PDF page:", err);
      return null;
    } finally {
      if (pdf && typeof pdf.destroy === "function") {
        try {
          pdf.destroy();
        } catch (_) {}
      }
    }
  };

  const p = renderQueue.then(doRender, doRender);
  renderQueue = p.catch(() => {});
  return p;
}
