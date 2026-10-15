import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { checkAborted, ToolError, type ToolModule } from "@pdfkit/core";
import { manifest } from "./manifest.ts";

export interface OrganizePageItem {
  fileIndex: number;
  pageIndex: number; // 0-indexed
  rotation?: number; // 0, 90, 180, 270 degrees
  isBlank?: boolean;
}

export interface OrganizeOpts {
  pages?: string | OrganizePageItem[];
  outputName?: string;
}

const mod: ToolModule<OrganizeOpts> = {
  manifest,
  async run(files, opts, ctx) {
    checkAborted(ctx.signal);
    if (!files || files.length === 0) {
      throw new ToolError("At least one PDF file is required.");
    }

    // Pre-load all source documents
    const srcDocs = await Promise.all(
      files.map((file) => {
        checkAborted(ctx.signal);
        return PDFDocument.load(file.data);
      })
    );

    let items: OrganizePageItem[] = [];
    if (Array.isArray(opts.pages)) {
      items = opts.pages;
    } else if (typeof opts.pages === "string" && opts.pages.trim()) {
      try {
        items = JSON.parse(opts.pages);
      } catch {
        throw new ToolError("Invalid pages specification JSON.");
      }
    } else {
      // Default: copy all pages from all files in input order
      for (let f = 0; f < srcDocs.length; f++) {
        const count = srcDocs[f].getPageCount();
        for (let p = 0; p < count; p++) {
          items.push({ fileIndex: f, pageIndex: p, rotation: 0 });
        }
      }
    }

    if (items.length === 0) {
      throw new ToolError("No pages remaining to organize. At least one page must be kept.");
    }

    // Validate page requests upfront
    for (const item of items) {
      if (!item.isBlank) {
        const fileIdx = Number(item.fileIndex) || 0;
        const pageIdx = Number(item.pageIndex) || 0;
        if (fileIdx < 0 || fileIdx >= srcDocs.length) {
          throw new ToolError(`Invalid file index ${fileIdx}.`);
        }
        const src = srcDocs[fileIdx];
        if (pageIdx < 0 || pageIdx >= src.getPageCount()) {
          throw new ToolError(`Invalid page index ${pageIdx} for file ${files[fileIdx].name}.`);
        }
      }
    }

    const outDoc = await PDFDocument.create();

    // Group page copies per source doc to avoid awaiting in a loop
    const docRequestedPages: number[][] = srcDocs.map(() => []);
    for (const item of items) {
      if (!item.isBlank) {
        docRequestedPages[Number(item.fileIndex) || 0].push(Number(item.pageIndex) || 0);
      }
    }

    const copiedPagesPerDoc = await Promise.all(
      srcDocs.map((src, fIdx) =>
        docRequestedPages[fIdx].length > 0
          ? outDoc.copyPages(src, docRequestedPages[fIdx])
          : Promise.resolve([])
      )
    );

    const pageCursors = new Array(srcDocs.length).fill(0);
    const totalItems = items.length;

    for (let i = 0; i < totalItems; i++) {
      checkAborted(ctx.signal);
      const item = items[i];

      if (item.isBlank) {
        // Add a standard A4 blank page (595.28 x 841.89)
        outDoc.addPage([595.28, 841.89]);
      } else {
        const fileIdx = Number(item.fileIndex) || 0;
        const copied = copiedPagesPerDoc[fileIdx][pageCursors[fileIdx]++];
        if (item.rotation) {
          const curAngle = copied.getRotation().angle;
          copied.setRotation(degrees((curAngle + Number(item.rotation)) % 360));
        }
        outDoc.addPage(copied);
      }

      ctx.onProgress((i + 1) / totalItems);
    }

    checkAborted(ctx.signal);
    const data = await outDoc.save({ useObjectStreams: true });

    let baseName = opts.outputName;
    if (!baseName) {
      const first = files[0].name.replace(/\.pdf$/i, "");
      baseName = `${first}_organized.pdf`;
    }
    if (!baseName.toLowerCase().endsWith(".pdf")) {
      baseName += ".pdf";
    }

    return [{
      name: baseName,
      mime: "application/pdf",
      data,
    }];
  },
};

export default mod;
