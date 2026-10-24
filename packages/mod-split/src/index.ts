import { PDFDocument } from "@cantoo/pdf-lib";
import { checkAborted, parsePageSpec, ToolError, type ToolModule } from "@pdfkit/core";
import { DEFAULT_MAX_SIZE_BYTES, manifest } from "./manifest.ts";

export { DEFAULT_MAX_SIZE_BYTES };

function resolveMaxSizeBytes(optValue?: number): number {
  const parsed = Number(optValue);
  return parsed > 0 ? parsed : DEFAULT_MAX_SIZE_BYTES;
}

function assertPageWithinLimit(pageIndex: number, byteLength: number, maxLimit: number): void {
  if (byteLength > maxLimit) {
    throw new ToolError(
      `Page ${pageIndex + 1} size (${byteLength} bytes) exceeds the maximum allowed size of ${maxLimit} bytes.`
    );
  }
}

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
      const maxBytes = resolveMaxSizeBytes(opts.maxSizeBytes);
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

        if (savedBytes.byteLength <= maxBytes) {
          currentGroup.push(i);
        } else if (currentGroup.length === 0) {
          assertPageWithinLimit(i, savedBytes.byteLength, maxBytes);
        } else {
          groups.push(currentGroup);
          const singleDoc = await PDFDocument.create();
          const [singleCopied] = await singleDoc.copyPages(src, [i]);
          singleDoc.addPage(singleCopied);
          const singleBytes = await singleDoc.save({ useObjectStreams: useStreams });
          assertPageWithinLimit(i, singleBytes.byteLength, maxBytes);
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
      const maxBytes = opts.mode === "size" ? resolveMaxSizeBytes(opts.maxSizeBytes) : undefined;
      if (maxBytes !== undefined && groups.length > 1) {
        throw new ToolError(
          `Cannot merge all parts into a single PDF: total size exceeds the maximum size limit of ${maxBytes} bytes.`
        );
      }
      const doc = await PDFDocument.create();
      const allPages = groups.flat();
      const copied = await doc.copyPages(src, allPages);
      copied.forEach((p) => doc.addPage(p));
      ctx.onProgress(1);
      const mergedData = await doc.save({ useObjectStreams: opts.allowCompression !== false });
      if (maxBytes !== undefined && mergedData.byteLength > maxBytes) {
        throw new ToolError(
          `Cannot merge all parts into a single PDF: merged file size (${mergedData.byteLength} bytes) exceeds the maximum size limit of ${maxBytes} bytes.`
        );
      }
      return [{
        name: `${base}-merged.pdf`,
        mime: "application/pdf",
        data: mergedData,
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
