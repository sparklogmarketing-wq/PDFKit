import { PDFDocument } from "@cantoo/pdf-lib";
import { checkAborted, parsePageSpec, ToolError, type ToolModule } from "@pdfkit/core";
import { manifest } from "./manifest.ts";

const mod: ToolModule<{
  mode: string;
  ranges?: string;
  n?: number;
  mergeAll?: boolean;
  maxSizeBytes?: number;
  allowCompression?: boolean;
}> = {
  manifest,
  async run([file], opts, ctx) {
    checkAborted(ctx.signal);
    const src = await PDFDocument.load(file.data);
    const total = src.getPageCount();
    let groups: number[][];

    if (opts.mode === "size") {
      const maxBytes = Math.max(1024, Number(opts.maxSizeBytes) || 1024 * 1024);
      const useStreams = opts.allowCompression !== false;
      groups = [];
      let currentGroup: number[] = [];

      for (let i = 0; i < total; i++) {
        checkAborted(ctx.signal);
        // Test adding page i to current group
        const testDoc = await PDFDocument.create();
        const pagesToCopy = [...currentGroup, i];
        const copied = await testDoc.copyPages(src, pagesToCopy);
        copied.forEach((p) => testDoc.addPage(p));
        const savedBytes = await testDoc.save({ useObjectStreams: useStreams });

        if (savedBytes.byteLength <= maxBytes || currentGroup.length === 0) {
          currentGroup.push(i);
        } else {
          groups.push(currentGroup);
          currentGroup = [i];
        }
        ctx.onProgress(((i + 1) / total) * 0.5);
      }
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
    } else if (opts.mode === "every") {
      const n = Math.max(1, Math.floor(Number(opts.n) || 1));
      groups = [];
      for (let i = 0; i < total; i += n) groups.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k));
    } else {
      const r = (opts.ranges ?? "").trim();
      if (!r) throw new ToolError("No page ranges given.");
      groups = r.split(",").filter((g) => g.trim()).map((g) => parsePageSpec(g, total));
    }

    if (!groups.length) throw new ToolError("No page ranges given.");
    const base = file.name.replace(/\.pdf$/i, "");

    if (opts.mergeAll) {
      checkAborted(ctx.signal);
      const doc = await PDFDocument.create();
      const allPages = groups.flat();
      const copied = await doc.copyPages(src, allPages);
      copied.forEach((p) => doc.addPage(p));
      ctx.onProgress(1);
      return [{
        name: `${base}-merged.pdf`,
        mime: "application/pdf",
        data: await doc.save({ useObjectStreams: opts.allowCompression !== false }),
      }];
    }

    const outputs = [];
    const baseProgress = opts.mode === "size" ? 0.5 : 0;
    const progressScale = opts.mode === "size" ? 0.5 : 1;

    for (let i = 0; i < groups.length; i++) {
      checkAborted(ctx.signal);
      const doc = await PDFDocument.create();
      (await doc.copyPages(src, groups[i])).forEach((p) => doc.addPage(p));
      const saved = await doc.save({ useObjectStreams: opts.allowCompression !== false });
      outputs.push({ name: `${base}-part${i + 1}.pdf`, mime: "application/pdf", data: saved });
      ctx.onProgress(baseProgress + ((i + 1) / groups.length) * progressScale);
    }
    return outputs;
  },
};
export default mod;
