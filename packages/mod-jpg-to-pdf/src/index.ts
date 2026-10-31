import { PDFDocument, type PDFImage, type PDFPage } from "@cantoo/pdf-lib";
import {
  checkAborted,
  ToolError,
  type OutputFile,
  type RunContext,
  type ToolModule,
} from "@pdfkit/core";
import { manifest } from "./manifest.ts";

export interface PngToPdfOptions {
  readonly pageSize?: "fit" | "a4" | "letter" | string;
  readonly orientation?: "auto" | "portrait" | "landscape" | string;
  readonly margin?: "none" | "small" | "large" | number | string;
  readonly mergeAll?: boolean;
  readonly outputName?: string;
}

const PAGE_DIMS: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

function parseMargin(margin?: "none" | "small" | "large" | number | string): number {
  if (typeof margin === "number") return Math.max(0, margin);
  if (margin === "small") return 20;
  if (margin === "large") return 40;
  return 0;
}

function resolvePageDimensions(
  pageSize: string,
  orientation: string,
  img: PDFImage,
  margin: number
): [number, number] {
  if (pageSize === "a4" || pageSize === "letter") {
    const base = PAGE_DIMS[pageSize];
    const isLandscape =
      orientation === "landscape" ||
      (orientation === "auto" && img.width > img.height);
    return isLandscape ? [base[1], base[0]] : [base[0], base[1]];
  }
  return [img.width + margin * 2, img.height + margin * 2];
}

function addImageToDocument(
  doc: PDFDocument,
  img: PDFImage,
  opts: PngToPdfOptions
): PDFPage {
  const pageSize = (opts.pageSize ?? "a4").toLowerCase();
  const orientation = (opts.orientation ?? "portrait").toLowerCase();
  const margin = parseMargin(opts.margin);

  const [pageWidth, pageHeight] = resolvePageDimensions(
    pageSize,
    orientation,
    img,
    margin
  );

  const availW = Math.max(1, pageWidth - margin * 2);
  const availH = Math.max(1, pageHeight - margin * 2);

  const scale = Math.min(availW / img.width, availH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = margin + (availW - drawW) / 2;
  const drawY = margin + (availH - drawH) / 2;

  const page = doc.addPage([pageWidth, pageHeight]);
  page.drawImage(img, {
    x: drawX,
    y: drawY,
    width: drawW,
    height: drawH,
  });

  return page;
}

async function embedImage(
  doc: PDFDocument,
  name: string,
  data: Uint8Array
): Promise<PDFImage> {
  const isJpg = data.length >= 2 && data[0] === 0xff && data[1] === 0xd8;
  const isPng =
    data.length >= 4 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47;

  // 1. If magic bytes indicate JPG, try embedJpg first, fallback to embedPng
  if (isJpg) {
    try {
      return await doc.embedJpg(data);
    } catch {
      try {
        return await doc.embedPng(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Invalid JPEG image";
        throw new ToolError(
          `Failed to embed JPEG image "${name}": ${msg}`
        );
      }
    }
  }

  // 2. If magic bytes indicate PNG, try embedPng first, fallback to embedJpg
  if (isPng) {
    try {
      return await doc.embedPng(data);
    } catch {
      try {
        return await doc.embedJpg(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Invalid PNG image";
        throw new ToolError(
          `Failed to embed PNG image "${name}": ${msg}`
        );
      }
    }
  }

  // 3. Magic bytes unknown: attempt embedJpg, then embedPng
  try {
    return await doc.embedJpg(data);
  } catch {
    try {
      return await doc.embedPng(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unsupported format";
      throw new ToolError(
        `Image "${name}" is not a recognized JPEG or PNG format (${msg}).`
      );
    }
  }
}

async function convertMerged(
  inputs: { name: string; data: Uint8Array }[],
  opts: PngToPdfOptions,
  ctx: RunContext
): Promise<OutputFile[]> {
  checkAborted(ctx.signal);
  const doc = await PDFDocument.create();

  const embeddedImages = await Promise.all(
    inputs.map(async (input) => {
      checkAborted(ctx.signal);
      return embedImage(doc, input.name, input.data);
    })
  );

  for (const img of embeddedImages) {
    addImageToDocument(doc, img, opts);
  }

  ctx.onProgress(0.85);
  checkAborted(ctx.signal);

  const pdfBytes = await doc.save();
  ctx.onProgress(1.0);

  const defaultName =
    inputs.length === 1
      ? `${inputs[0].name.replace(/\.[^/.]+$/, "")}.pdf`
      : "converted.pdf";

  const outName = (opts.outputName ?? "").trim() || defaultName;

  return [
    {
      name: outName.endsWith(".pdf") ? outName : `${outName}.pdf`,
      mime: "application/pdf",
      data: pdfBytes,
    },
  ];
}

async function convertIndividual(
  inputs: { name: string; data: Uint8Array }[],
  opts: PngToPdfOptions,
  ctx: RunContext
): Promise<OutputFile[]> {
  checkAborted(ctx.signal);

  const results = await Promise.all(
    inputs.map(async (input, idx) => {
      checkAborted(ctx.signal);
      const doc = await PDFDocument.create();
      const img = await embedImage(doc, input.name, input.data);
      addImageToDocument(doc, img, opts);

      const pdfBytes = await doc.save();
      ctx.onProgress((idx + 1) / inputs.length);

      const baseName = input.name.replace(/\.[^/.]+$/, "") || `image-${idx + 1}`;
      return {
        name: `${baseName}.pdf`,
        mime: "application/pdf",
        data: pdfBytes,
      };
    })
  );

  return results;
}

const mod: ToolModule<PngToPdfOptions> = {
  manifest,
  async run(inputs, opts = {}, ctx) {
    checkAborted(ctx.signal);
    if (!inputs || inputs.length === 0) {
      throw new ToolError("Please select at least one image file (PNG/JPG) to convert.");
    }

    const mergeAll = opts.mergeAll !== false;

    if (mergeAll || inputs.length === 1) {
      return convertMerged(inputs, opts, ctx);
    }

    return convertIndividual(inputs, opts, ctx);
  },
};

export default mod;
