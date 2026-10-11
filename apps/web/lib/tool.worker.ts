import { loaders } from "./registry";

self.onmessage = async (e: MessageEvent<{ id: string; inputs: any[]; opts: any }>) => {
  const { id, inputs, opts } = e.data;
  try {
    const loader = loaders[id];
    if (!loader) {
      throw new Error(`Tool "${id}" is not available.`);
    }
    const mod = (await loader()).default;
    const outputs = await mod.run(inputs, opts, {
      signal: new AbortController().signal, // cancel = worker.terminate()
      onProgress: (p) => (self as any).postMessage({ type: "progress", p }),
    });
    (self as any).postMessage({ type: "done", outputs }, outputs.map((o) => o.data.buffer));
  } catch (err: any) {
    (self as any).postMessage({ type: "error", message: err?.message ?? String(err) });
  }
};
