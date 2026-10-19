import { PDFDocument } from "@cantoo/pdf-lib";
import { checkAborted, parsePageSpec, ToolError, type ToolModule, type RunContext, type OutputFile } from "@pdfkit/core";
import { manifest } from "./manifest.ts";

export interface ExtractOpts {
  mode?: "select" | "all";
  pages?: string | number[];
  mergeAll?: boolean;
  outputName?: string;
  allowCompression?: boolean;
}

function resolvePageIndices(
  mode: string | undefined,
  pages: string | number[] | undefined,
  total: number
): number[] {
  if (mode === "all") {
    return Array.from({ length: total }, (_, i) => i);
  }

  if (Array.isArray(pages)) {
    const valid = pages
      .map((p) => Number(p))
      .filter((p) => Number.isInteger(p) && p >= 0 && p < total);
    const sorted = Array.from(new Set(valid)).sort((a, b) => a - b);
    if (sorted.length === 0) {
      throw new ToolError("No pages selected for extraction.");
    }
    return sorted;
  }

  const spec = typeof pages === "string" ? pages.trim() : "";
  if (!spec) {
    throw new ToolError("No pages selected for extraction.");
  }
  return parsePageSpec(spec, total);
}

function resolveMergedOutputName(customName: string | undefined, baseName: string): string {
  if (customName?.trim()) {
    const trimmed = customName.trim();
    return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`;
  }
  return `${baseName}-extracted.pdf`;
}

async function buildMergedPdf(
  src: PDFDocument,
  pageIndices: number[],
  allowCompression: boolean,
  ctx: RunContext
): Promise<Uint8Array> {
  checkAborted(ctx.signal);
  const outDoc = await PDFDocument.create();
  const copiedPages = await outDoc.copyPages(src, pageIndices);
  copiedPages.forEach((page) => outDoc.addPage(page));
  ctx.onProgress(1);
  return outDoc.save({ useObjectStreams: allowCompression });
}

async function buildSeparatedPdfs(
  src: PDFDocument,
  pageIndices: number[],
  baseName: string,
  allowCompression: boolean,
  ctx: RunContext
): Promise<OutputFile[]> {
  const total = pageIndices.length;
  return Promise.all(
    pageIndices.map(async (pageIdx, index) => {
      checkAborted(ctx.signal);
      const pageDoc = await PDFDocument.create();
      const [copiedPage] = await pageDoc.copyPages(src, [pageIdx]);
      pageDoc.addPage(copiedPage);
      const data = await pageDoc.save({ useObjectStreams: allowCompression });
      ctx.onProgress((index + 1) / total);
      return {
        name: `${baseName}-page${pageIdx + 1}.pdf`,
        mime: "application/pdf",
        data,
      };
    })
  );
}

const mod: ToolModule<ExtractOpts> = {
  manifest,
  async run([file], opts, ctx) {
    checkAborted(ctx.signal);
    if (!file) {
      throw new ToolError("A PDF file is required to extract pages.");
    }

    const src = await PDFDocument.load(file.data);
    const total = src.getPageCount();
    if (total === 0) {
      throw new ToolError("The provided PDF has no pages.");
    }

    const pageIndices = resolvePageIndices(opts.mode, opts.pages, total);
    if (pageIndices.length === 0) {
      throw new ToolError("No pages selected for extraction.");
    }

    const baseName = file.name.replace(/\.pdf$/i, "");
    const useStreams = opts.allowCompression !== false;

    if (opts.mergeAll !== false) {
      const data = await buildMergedPdf(src, pageIndices, useStreams, ctx);
      return [
        {
          name: resolveMergedOutputName(opts.outputName, baseName),
          mime: "application/pdf",
          data,
        },
      ];
    }

    return buildSeparatedPdfs(src, pageIndices, baseName, useStreams, ctx);
  },
};

export default mod;
