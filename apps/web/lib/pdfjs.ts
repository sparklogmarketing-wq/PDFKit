let pdfjsPromise: Promise<any> | null = null;

export function getPdfJs(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("PDF.js can only be loaded in the browser"));
  }
  if ((window as any).pdfjsLib) {
    return Promise.resolve((window as any).pdfjsLib);
  }
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/pdf.min.js";
      script.async = true;
      script.onload = () => {
        const lib = (window as any).pdfjsLib;
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.js";
          resolve(lib);
        } else {
          reject(new Error("pdfjsLib not defined after loading script"));
        }
      };
      script.onerror = () => {
        // Fallback to CDN if local script fails
        const cdnScript = document.createElement("script");
        cdnScript.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        cdnScript.async = true;
        cdnScript.onload = () => {
          const lib = (window as any).pdfjsLib;
          if (lib) {
            lib.GlobalWorkerOptions.workerSrc =
              "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
            resolve(lib);
          } else {
            reject(new Error("pdfjsLib not found on CDN"));
          }
        };
        cdnScript.onerror = reject;
        document.head.appendChild(cdnScript);
      };
      document.head.appendChild(script);
    });
  }
  return pdfjsPromise;
}

/** Quickly extract number of pages without full page rendering */
export async function getPdfInfo(file: File): Promise<{ numPages: number } | null> {
  try {
    const pdfjs = await getPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
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
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
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
