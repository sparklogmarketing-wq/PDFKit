import { PDFDocument } from "@cantoo/pdf-lib";
import { checkAborted, parsePageSpec, ToolError, type ToolModule } from "@pdfkit/core";
import { manifest } from "./manifest.ts";

async function findGroupPages(
  src: PDFDocument,
  start: number,
  total: number,
  maxBytes: number,
  useStreams: boolean,
  signal: AbortSignal
): Promise<{ count: number; data: Uint8Array }> {
  checkAborted(signal);

  // 1. Verify single page at start fits within limit
  const firstDoc = await PDFDocument.create();
  const [copiedFirst] = await firstDoc.copyPages(src, [start]);
  firstDoc.addPage(copiedFirst);
  const firstBytes = await firstDoc.save({ useObjectStreams: useStreams });

  if (firstBytes.byteLength > maxBytes) {
    throw new ToolError(
      `Page ${start + 1} size (${firstBytes.byteLength} bytes) exceeds the maximum allowed size of ${maxBytes} bytes.`
    );
  }

  if (start === total - 1) {
    return { count: 1, data: firstBytes };
  }

  // 2. Exponential (galloping) search to quickly bracket the group boundary
  let low = 1;
  let bestBytes = firstBytes;
  let step = 1;
  let high = total - start;

  while (low + step <= total - start) {
    checkAborted(signal);
    const testCount = low + step;
    const testDoc = await PDFDocument.create();
    const indices = Array.from({ length: testCount }, (_, k) => start + k);
    const copied = await testDoc.copyPages(src, indices);
    copied.forEach((p) => testDoc.addPage(p));
    const testBytes = await testDoc.save({ useObjectStreams: useStreams });

    if (testBytes.byteLength <= maxBytes) {
      low = testCount;
      bestBytes = testBytes;
      step *= 2;
    } else {
      high = testCount;
      break;
    }
  }

  // If we haven't tested the entire remainder up to total - start, test high
  if (high === total - start && low < high) {
    checkAborted(signal);
    const testDoc = await PDFDocument.create();
    const indices = Array.from({ length: high }, (_, k) => start + k);
    const copied = await testDoc.copyPages(src, indices);
    copied.forEach((p) => testDoc.addPage(p));
    const testBytes = await testDoc.save({ useObjectStreams: useStreams });

    if (testBytes.byteLength <= maxBytes) {
      return { count: high, data: testBytes };
    }
  }

  // 3. Binary search between low and high
  let left = low + 1;
  let right = high - 1;

  while (left <= right) {
    checkAborted(signal);
    const mid = Math.floor((left + right) / 2);
    const testDoc = await PDFDocument.create();
    const indices = Array.from({ length: mid }, (_, k) => start + k);
    const copied = await testDoc.copyPages(src, indices);
    copied.forEach((p) => testDoc.addPage(p));
    const testBytes = await testDoc.save({ useObjectStreams: useStreams });

    if (testBytes.byteLength <= maxBytes) {
      low = mid;
      bestBytes = testBytes;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return { count: low, data: bestBytes };
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
    if (total === 0) {
      throw new ToolError("PDF file contains no pages.");
    }
    const base = file.name.replace(/\.pdf$/i, "");
    let groups: number[][];

    if (opts.mode === "size") {
      const maxBytes = opts.maxSizeBytes !== undefined
        ? Number(opts.maxSizeBytes)
        : (1024 * 1024);
      if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
        throw new ToolError("Invalid maximum file size limit.");
      }
      const useStreams = opts.allowCompression !== false;
      const sizeOutputs: { name: string; mime: string; data: Uint8Array }[] = [];
      groups = [];
      let start = 0;

      while (start < total) {
        checkAborted(ctx.signal);
        const { count, data } = await findGroupPages(
          src,
          start,
          total,
          maxBytes,
          useStreams,
          ctx.signal
        );

        const groupIndices = Array.from({ length: count }, (_, k) => start + k);
        groups.push(groupIndices);

        const partNum = groups.length;
        sizeOutputs.push({
          name: `${base}-part${partNum}.pdf`,
          mime: "application/pdf",
          data,
        });

        start += count;
        ctx.onProgress(start / total);
      }

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
          data: await doc.save({ useObjectStreams: useStreams }),
        }];
      }

      return sizeOutputs;
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
    for (let i = 0; i < groups.length; i++) {
      checkAborted(ctx.signal);
      const doc = await PDFDocument.create();
      (await doc.copyPages(src, groups[i])).forEach((p) => doc.addPage(p));
      const saved = await doc.save({ useObjectStreams: opts.allowCompression !== false });
      outputs.push({ name: `${base}-part${i + 1}.pdf`, mime: "application/pdf", data: saved });
      ctx.onProgress((i + 1) / groups.length);
    }
    return outputs;
  },
};
export default mod;
