import { PDFDocument } from "@cantoo/pdf-lib";
import { checkAborted, parsePageSpec, ToolError, type ToolModule, type OutputFile } from "@pdfkit/core";
import { manifest } from "./manifest.ts";

export interface RemovePagesOptions {
  readonly pages?: string;
  readonly pageIndices?: readonly number[];
  readonly outputFileName?: string;
}

const mod: ToolModule<RemovePagesOptions> = {
  manifest,
  async run([file], opts, ctx) {
    if (!file) {
      throw new ToolError("No PDF file provided.");
    }

    checkAborted(ctx.signal);
    const src = await PDFDocument.load(file.data);
    const total = src.getPageCount();

    if (total === 0) {
      throw new ToolError("The selected PDF file has no pages.");
    }

    let removeIndices: number[] = [];
    if (opts.pageIndices && opts.pageIndices.length > 0) {
      removeIndices = [...opts.pageIndices].filter((idx) => idx >= 0 && idx < total);
    } else if (opts.pages && opts.pages.trim()) {
      removeIndices = parsePageSpec(opts.pages, total);
    } else {
      throw new ToolError("No pages selected for removal.");
    }

    const removeSet = new Set(removeIndices);
    if (removeSet.size === 0) {
      throw new ToolError("No valid pages found to remove.");
    }

    if (removeSet.size >= total) {
      throw new ToolError("Cannot remove all pages. A PDF must contain at least one page.");
    }

    ctx.onProgress(0.2);
    checkAborted(ctx.signal);

    const pagesToKeep: number[] = [];
    for (let i = 0; i < total; i++) {
      if (!removeSet.has(i)) {
        pagesToKeep.push(i);
      }
    }

    const dest = await PDFDocument.create();
    ctx.onProgress(0.4);
    checkAborted(ctx.signal);

    const copiedPages = await dest.copyPages(src, pagesToKeep);
    for (const page of copiedPages) {
      dest.addPage(page);
    }

    ctx.onProgress(0.7);
    checkAborted(ctx.signal);

    const data = await dest.save();
    ctx.onProgress(1.0);

    const baseName = file.name.replace(/\.pdf$/i, "");
    let finalName = opts.outputFileName?.trim() || `${baseName}-removed.pdf`;
    if (!finalName.toLowerCase().endsWith(".pdf")) {
      finalName = `${finalName}.pdf`;
    }

    const result: OutputFile = {
      name: finalName,
      mime: "application/pdf",
      data,
    };

    return [result];
  },
};

export default mod;
