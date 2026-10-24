import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { checkAborted, ToolError, type ToolModule, type RunContext } from "@pdfkit/core";
import { manifest } from "./manifest.ts";

export interface OrganizePageItem {
  fileIndex: number;
  pageIndex: number; // 0-indexed
  rotation?: number; // 0, 90, 180, 270 degrees
  isBlank?: boolean;
  width?: number;
  height?: number;
}

export function getInheritedPageDimensions(
  items: OrganizePageItem[],
  currentIndex: number,
  srcDocs: PDFDocument[]
): [number, number] {
  const current = items[currentIndex];
  if (current.width && current.height && current.width > 0 && current.height > 0) {
    return [current.width, current.height];
  }

  // 1. Look backwards for the closest non-blank page
  for (let j = currentIndex - 1; j >= 0; j--) {
    const it = items[j];
    if (!it.isBlank) {
      const fIdx = Number(it.fileIndex);
      const pIdx = Number(it.pageIndex);
      if (srcDocs[fIdx] && pIdx >= 0 && pIdx < srcDocs[fIdx].getPageCount()) {
        const p = srcDocs[fIdx].getPage(pIdx);
        const { width, height } = p.getSize();
        return [width, height];
      }
    }
  }

  // 2. Look forwards for the closest non-blank page
  for (let j = currentIndex + 1; j < items.length; j++) {
    const it = items[j];
    if (!it.isBlank) {
      const fIdx = Number(it.fileIndex);
      const pIdx = Number(it.pageIndex);
      if (srcDocs[fIdx] && pIdx >= 0 && pIdx < srcDocs[fIdx].getPageCount()) {
        const p = srcDocs[fIdx].getPage(pIdx);
        const { width, height } = p.getSize();
        return [width, height];
      }
    }
  }

  // 3. Fallback to first page of first document with pages
  for (const doc of srcDocs) {
    if (doc.getPageCount() > 0) {
      const { width, height } = doc.getPage(0).getSize();
      return [width, height];
    }
  }

  // 4. Default standard A4
  return [595.28, 841.89];
}

export function reinsertBlanksAtRelativePositions<T extends { isBlank?: boolean }>(
  originalItems: T[],
  reorderedNonBlanks: T[]
): T[] {
  let nonBlanksCount = 0;
  for (let i = 0; i < originalItems.length; i++) {
    if (!originalItems[i].isBlank) {
      nonBlanksCount++;
    }
  }

  const blanksWithMeta: { item: T; ratio: number }[] = [];
  let nonBlanksSeen = 0;
  for (let i = 0; i < originalItems.length; i++) {
    if (originalItems[i].isBlank) {
      blanksWithMeta.push({
        item: originalItems[i],
        ratio: nonBlanksCount > 0 ? nonBlanksSeen / nonBlanksCount : 0,
      });
    } else {
      nonBlanksSeen++;
    }
  }

  if (blanksWithMeta.length === 0) {
    return reorderedNonBlanks;
  }

  const M = reorderedNonBlanks.length;
  const blanksAtTarget = new Map<number, T[]>();
  for (let i = 0; i <= M; i++) {
    blanksAtTarget.set(i, []);
  }

  for (const meta of blanksWithMeta) {
    const targetIdx = M > 0 ? Math.min(M, Math.max(0, Math.round(meta.ratio * M))) : 0;
    const targetList = blanksAtTarget.get(targetIdx);
    if (targetList) {
      targetList.push(meta.item);
    }
  }

  const result: T[] = [];
  for (let i = 0; i <= M; i++) {
    const blanks = blanksAtTarget.get(i);
    if (blanks && blanks.length > 0) {
      result.push(...blanks);
    }
    if (i < M) {
      result.push(reorderedNonBlanks[i]);
    }
  }

  return result;
}

export interface OrganizeOpts {
  pages?: string | OrganizePageItem[];
  outputName?: string;
}

const VALID_ROTATIONS = new Set([0, 90, 180, 270]);

function validateRotation(rotation: unknown, index: number): void {
  if (rotation === undefined || rotation === null) return;
  if (typeof rotation !== "number" || !VALID_ROTATIONS.has(rotation)) {
    throw new ToolError(
      `Invalid rotation value ${String(rotation)} at index ${index}. Rotation must be one of 0, 90, 180, or 270 degrees.`
    );
  }
}

function validateFileIndex(
  fileIndex: unknown,
  index: number,
  srcDocsLength: number
): number {
  if (typeof fileIndex !== "number" || !Number.isInteger(fileIndex)) {
    throw new ToolError(`Invalid or missing fileIndex at index ${index}. Must be an integer.`);
  }
  if (fileIndex < 0 || fileIndex >= srcDocsLength) {
    throw new ToolError(`Invalid file index ${fileIndex}.`);
  }
  return fileIndex;
}

function validatePageIndex(
  fileIndex: number,
  pageIndex: unknown,
  index: number,
  srcDocs: PDFDocument[],
  fileNames: string[]
): void {
  if (typeof pageIndex !== "number" || !Number.isInteger(pageIndex)) {
    throw new ToolError(`Invalid or missing pageIndex at index ${index}. Must be an integer.`);
  }
  const src = srcDocs[fileIndex];
  if (pageIndex < 0 || pageIndex >= src.getPageCount()) {
    throw new ToolError(`Invalid page index ${pageIndex} for file ${fileNames[fileIndex]}.`);
  }
}

function parseOrganizeItems(opts: OrganizeOpts, srcDocs: PDFDocument[]): OrganizePageItem[] {
  if (opts.pages === undefined || opts.pages === null) {
    // Default: copy all pages from all files in input order
    const defaultItems: OrganizePageItem[] = [];
    for (let f = 0; f < srcDocs.length; f++) {
      const count = srcDocs[f].getPageCount();
      for (let p = 0; p < count; p++) {
        defaultItems.push({ fileIndex: f, pageIndex: p, rotation: 0 });
      }
    }
    return defaultItems;
  }

  if (typeof opts.pages === "string") {
    const trimmed = opts.pages.trim();
    if (!trimmed) {
      const defaultItems: OrganizePageItem[] = [];
      for (let f = 0; f < srcDocs.length; f++) {
        const count = srcDocs[f].getPageCount();
        for (let p = 0; p < count; p++) {
          defaultItems.push({ fileIndex: f, pageIndex: p, rotation: 0 });
        }
      }
      return defaultItems;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new ToolError("Invalid pages specification JSON.");
    }
    if (!Array.isArray(parsed)) {
      throw new ToolError("Pages specification must be an array of page items.");
    }
    return parsed as OrganizePageItem[];
  }

  if (Array.isArray(opts.pages)) {
    return opts.pages;
  }

  throw new ToolError("Pages specification must be an array of page items.");
}

function validateOrganizeItems(
  items: OrganizePageItem[],
  srcDocs: PDFDocument[],
  fileNames: string[]
): void {
  if (!Array.isArray(items)) {
    throw new ToolError("Pages specification must be an array of page items.");
  }
  if (items.length === 0) {
    throw new ToolError("No pages remaining to organize. At least one real page is required.");
  }

  let realPageCount = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item !== "object" || item === null) {
      throw new ToolError(`Invalid page item at index ${i}: item must be an object.`);
    }

    validateRotation(item.rotation, i);

    if (item.isBlank) {
      continue;
    }

    const fileIdx = validateFileIndex(item.fileIndex, i, srcDocs.length);
    validatePageIndex(fileIdx, item.pageIndex, i, srcDocs, fileNames);
    realPageCount++;
  }

  if (realPageCount === 0) {
    throw new ToolError("No pages remaining to organize. At least one real page is required.");
  }
}

async function buildOrganizedPdf(
  srcDocs: PDFDocument[],
  items: OrganizePageItem[],
  ctx: RunContext
): Promise<Uint8Array> {
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
      const [width, height] = getInheritedPageDimensions(items, i, srcDocs);
      const blankPage = outDoc.addPage([width, height]);
      if (item.rotation) {
        blankPage.setRotation(degrees(((Number(item.rotation) % 360) + 360) % 360));
      }
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
  return outDoc.save({ useObjectStreams: true });
}

function resolveOutputName(customName: string | undefined, defaultFirstFileName: string): string {
  let baseName = customName;
  if (!baseName) {
    const first = defaultFirstFileName.replace(/\.pdf$/i, "");
    baseName = `${first}_organized.pdf`;
  }
  if (!baseName.toLowerCase().endsWith(".pdf")) {
    baseName += ".pdf";
  }
  return baseName;
}

const mod: ToolModule<OrganizeOpts> = {
  manifest,
  async run(files, opts, ctx) {
    checkAborted(ctx.signal);
    if (!files || files.length === 0) {
      throw new ToolError("At least one PDF file is required.");
    }

    const srcDocs = await Promise.all(
      files.map((file) => {
        checkAborted(ctx.signal);
        return PDFDocument.load(file.data);
      })
    );

    const items = parseOrganizeItems(opts, srcDocs);
    validateOrganizeItems(items, srcDocs, files.map((f) => f.name));

    const data = await buildOrganizedPdf(srcDocs, items, ctx);
    const outputName = resolveOutputName(opts.outputName, files[0].name);

    return [{
      name: outputName,
      mime: "application/pdf",
      data,
    }];
  },
};

export default mod;
