import type { OutputFile } from "@pdfkit/core";

export class CancelledError extends Error {
  constructor(message = "Cancelled") {
    super(message);
    this.name = "CancelledError";
    Object.setPrototypeOf(this, CancelledError.prototype);
  }
}

export function isCancelledError(err: unknown): err is CancelledError {
  if (!err) return false;
  if (err instanceof CancelledError) return true;
  if (err instanceof Error) {
    return (
      err.name === "CancelledError" ||
      err.message === "Cancelled" ||
      err.message === "Operation cancelled"
    );
  }
  return false;
}

export interface RunToolJob {
  promise: Promise<OutputFile[]>;
  cancel: () => void;
}

/** Runs a tool in a dedicated Web Worker. Returns a cancel() handle. */
export function runTool(
  id: string,
  inputs: { name: string; data: Uint8Array }[],
  opts: Record<string, any>,
  onProgress: (p: number) => void,
): RunToolJob {
  let settled = false;
  let worker: Worker | null = new Worker(new URL("./tool.worker.ts", import.meta.url));
  let rejectPromise: ((reason?: any) => void) | null = null;

  const promise = new Promise<OutputFile[]>((resolve, reject) => {
    rejectPromise = reject;

    if (!worker) {
      settled = true;
      reject(new CancelledError());
      return;
    }

    worker.onmessage = (e) => {
      if (settled) return;
      if (e.data.type === "progress") {
        onProgress(e.data.p);
      } else if (e.data.type === "done") {
        settled = true;
        const currentWorker = worker;
        worker = null;
        currentWorker?.terminate();
        resolve(e.data.outputs);
      } else {
        settled = true;
        const currentWorker = worker;
        worker = null;
        currentWorker?.terminate();
        reject(new Error(e.data.message));
      }
    };

    worker.onerror = (e) => {
      if (settled) return;
      settled = true;
      const currentWorker = worker;
      worker = null;
      currentWorker?.terminate();
      reject(new Error(e.message));
    };

    try {
      worker.postMessage({ id, inputs, opts }, inputs.map((i) => i.data.buffer));
    } catch (err) {
      settled = true;
      const currentWorker = worker;
      worker = null;
      currentWorker?.terminate();
      reject(err);
    }
  });

  const cancel = () => {
    if (settled) return;
    settled = true;
    const currentWorker = worker;
    worker = null;
    currentWorker?.terminate();
    rejectPromise?.(new CancelledError());
  };

  return { promise, cancel };
}
