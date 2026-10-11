import type { OutputFile } from "@pdfkit/core";

/** Runs a tool in a dedicated Web Worker. Returns a cancel() handle. */
export function runTool(
  id: string, inputs: { name: string; data: Uint8Array }[], opts: Record<string, any>,
  onProgress: (p: number) => void,
) {
  const worker = new Worker(new URL("./tool.worker.ts", import.meta.url));
  const promise = new Promise<OutputFile[]>((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.type === "progress") onProgress(e.data.p);
      else if (e.data.type === "done") { resolve(e.data.outputs); worker.terminate(); }
      else { reject(new Error(e.data.message)); worker.terminate(); }
    };
    worker.onerror = (e) => { reject(new Error(e.message)); worker.terminate(); };
    worker.postMessage({ id, inputs, opts }, inputs.map((i) => i.data.buffer));
  });
  return { promise, cancel: () => worker.terminate() };
}
