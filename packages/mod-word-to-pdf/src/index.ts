import { PDFDocument, StandardFonts, rgb, degrees } from "@cantoo/pdf-lib";
import JSZipModule from "jszip";
import {
  type ToolModule,
  type RunContext,
  type OutputFile,
  ToolError,
  checkAborted,
} from "@pdfkit/core";
import { manifest } from "./manifest.ts";

export interface WordToPdfOptions {
  /** Rotation angle in degrees: 0, 90, 180, 270. Default: 0 */
  readonly degrees?: number;
  /** Per-file rotation mapping by file name or zero-based index */
  readonly rotations?: Record<string | number, number>;
  /** Combine all converted documents into a single PDF output. Default: false */
  readonly mergeAll?: boolean;
  /** Custom output file name if mergeAll is true */
  readonly outputName?: string;
  /** Page size: "a4" | "letter". Default: "a4" */
  readonly pageSize?: "a4" | "letter";
}

interface TextSpan {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly isPageBreak?: boolean;
}

interface DocParagraph {
  readonly spans: TextSpan[];
  readonly isHeading?: boolean;
  readonly headingLevel?: number;
  readonly align?: "left" | "center" | "right";
}

const PAGE_SIZES = {
  a4: [595.28, 841.89] as const,
  letter: [612.0, 792.0] as const,
};

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Extracts paragraphs and runs from Word DOCX XML.
 */
function parseDocxXml(xml: string): DocParagraph[] {
  const paragraphs: DocParagraph[] = [];

  // Match all paragraphs <w:p ...>...</w:p>
  const pRegex = /<w:p(?:\s+[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pBody = pMatch[1];

    // Determine heading style if present
    let isHeading = false;
    let headingLevel = 1;
    const styleMatch = /<w:pStyle\s+[^>]*w:val="([^"]+)"/i.exec(pBody);
    if (styleMatch) {
      const val = styleMatch[1].toLowerCase();
      if (val.includes("heading") || val.includes("title")) {
        isHeading = true;
        const num = val.match(/\d+/);
        if (num) headingLevel = Math.min(Math.max(parseInt(num[0], 10), 1), 4);
      }
    }

    // Determine alignment
    let align: "left" | "center" | "right" = "left";
    const jcMatch = /<w:jc\s+[^>]*w:val="([^"]+)"/i.exec(pBody);
    if (jcMatch) {
      const jcVal = jcMatch[1].toLowerCase();
      if (jcVal === "center") align = "center";
      else if (jcVal === "right") align = "right";
    }

    // Collect runs and breaks inside paragraph
    const spans: TextSpan[] = [];
    const rRegex = /<w:r(?:\s+[^>]*)?>([\s\S]*?)<\/w:r>/g;
    let rMatch: RegExpExecArray | null;

    while ((rMatch = rRegex.exec(pBody)) !== null) {
      const rBody = rMatch[1];
      const isBold = /<w:b(?:\s|\/|>)/.test(rBody) && !/<w:b\s+[^>]*w:val="(?:0|false)"/i.test(rBody);
      const isItalic = /<w:i(?:\s|\/|>)/.test(rBody) && !/<w:i\s+[^>]*w:val="(?:0|false)"/i.test(rBody);
      const hasPageBreak = /<w:br\s+[^>]*w:type="page"/i.test(rBody);

      if (hasPageBreak) {
        spans.push({ text: "", isPageBreak: true });
      }

      // Collect text elements
      const tRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRegex.exec(rBody)) !== null) {
        const text = decodeXmlEntities(tMatch[1]);
        if (text) {
          spans.push({ text, bold: isBold, italic: isItalic });
        }
      }
    }

    if (spans.length > 0) {
      paragraphs.push({ spans, isHeading, headingLevel, align });
    } else {
      // Empty spacing paragraph
      paragraphs.push({ spans: [{ text: "" }], align: "left" });
    }
  }

  return paragraphs;
}

/**
 * Extracts plain text paragraphs from legacy binary files or plain text.
 */
function extractPlainTextParagraphs(data: Uint8Array): DocParagraph[] {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const rawText = decoder.decode(data);
  // Filter readable printable strings
  const lines = rawText
    .replace(/[^\x20-\x7E\t\n\r\u00A0-\u024F]/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return [{ spans: [{ text: "Converted Document" }], isHeading: true, headingLevel: 1 }];
  }

  return lines.map((line) => ({
    spans: [{ text: line }],
    align: "left",
  }));
}

/**
 * Checks if a byte buffer represents a PDF file.
 */
function isPdfBuffer(data: Uint8Array): boolean {
  if (data.length < 5) return false;
  return (
    data[0] === 0x25 && // %
    data[1] === 0x50 && // P
    data[2] === 0x44 && // D
    data[3] === 0x46 && // F
    data[4] === 0x2d    // -
  );
}

/**
 * Renders parsed paragraphs to a newly created PDFDocument.
 */
async function renderParagraphsToPdf(
  paragraphs: readonly DocParagraph[],
  pageSizeKey: "a4" | "letter" = "a4",
  rotationDegrees = 0
): Promise<PDFDocument> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontBoldItalic = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

  const [pageW, pageH] = PAGE_SIZES[pageSizeKey] || PAGE_SIZES.a4;
  const marginLeft = 54;
  const marginRight = 54;
  const marginTop = 54;
  const marginBottom = 54;
  const contentWidth = pageW - marginLeft - marginRight;

  let currentPage = pdfDoc.addPage([pageW, pageH]);
  let currentY = pageH - marginTop;

  function addNewPage() {
    currentPage = pdfDoc.addPage([pageW, pageH]);
    currentY = pageH - marginTop;
  }

  for (const p of paragraphs) {
    // Heading sizing & styling
    let fontSize = 11;
    let baseLineHeight = 16;
    let spaceBefore = 4;
    let spaceAfter = 4;

    if (p.isHeading) {
      if (p.headingLevel === 1) {
        fontSize = 18;
        baseLineHeight = 24;
        spaceBefore = 14;
        spaceAfter = 8;
      } else if (p.headingLevel === 2) {
        fontSize = 15;
        baseLineHeight = 20;
        spaceBefore = 10;
        spaceAfter = 6;
      } else {
        fontSize = 13;
        baseLineHeight = 18;
        spaceBefore = 8;
        spaceAfter = 4;
      }
    }

    currentY -= spaceBefore;

    // Check if paragraph spans contain explicit page break
    let isFullPageBreak = false;
    for (const span of p.spans) {
      if (span.isPageBreak) {
        addNewPage();
        isFullPageBreak = true;
        break;
      }
    }
    if (isFullPageBreak) continue;

    // Build words for line wrapping
    const wordsWithStyle: { word: string; font: any; size: number }[] = [];
    for (const span of p.spans) {
      if (!span.text) continue;
      let runFont = fontRegular;
      if (span.bold && span.italic) runFont = fontBoldItalic;
      else if (span.bold || p.isHeading) runFont = fontBold;
      else if (span.italic) runFont = fontItalic;

      const words = span.text.split(/(\s+)/);
      for (const w of words) {
        if (w) {
          wordsWithStyle.push({ word: w, font: runFont, size: fontSize });
        }
      }
    }

    if (wordsWithStyle.length === 0) {
      currentY -= baseLineHeight;
      if (currentY < marginBottom) addNewPage();
      continue;
    }

    // Wrap words into lines
    let currentLine: { word: string; font: any; size: number }[] = [];
    let currentLineWidth = 0;

    for (const item of wordsWithStyle) {
      let wordW = 0;
      try {
        wordW = item.font.widthOfTextAtSize(item.word, item.size);
      } catch {
        wordW = item.size * 0.5 * item.word.length;
      }

      if (currentLineWidth + wordW > contentWidth && currentLine.length > 0) {
        // Draw the current line
        if (currentY - baseLineHeight < marginBottom) {
          addNewPage();
        }
        drawLine(currentPage, currentLine, currentLineWidth, currentY, marginLeft, contentWidth, p.align);
        currentY -= baseLineHeight;
        currentLine = [];
        currentLineWidth = 0;

        // Skip leading whitespace on new line
        if (/^\s+$/.test(item.word)) continue;
      }

      currentLine.push(item);
      currentLineWidth += wordW;
    }

    // Draw any trailing line
    if (currentLine.length > 0) {
      if (currentY - baseLineHeight < marginBottom) {
        addNewPage();
      }
      drawLine(currentPage, currentLine, currentLineWidth, currentY, marginLeft, contentWidth, p.align);
      currentY -= baseLineHeight;
    }

    currentY -= spaceAfter;
  }

  // Apply rotation to all pages if specified
  const normRot = ((rotationDegrees % 360) + 360) % 360;
  if (normRot !== 0) {
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      page.setRotation(degrees(normRot));
    }
  }

  return pdfDoc;
}

function drawLine(
  page: any,
  line: { word: string; font: any; size: number }[],
  lineWidth: number,
  y: number,
  marginLeft: number,
  contentWidth: number,
  align?: "left" | "center" | "right"
) {
  let startX = marginLeft;
  if (align === "center") {
    startX = marginLeft + Math.max(0, (contentWidth - lineWidth) / 2);
  } else if (align === "right") {
    startX = marginLeft + Math.max(0, contentWidth - lineWidth);
  }

  let x = startX;
  for (const item of line) {
    try {
      page.drawText(item.word, {
        x,
        y,
        size: item.size,
        font: item.font,
        color: rgb(0.12, 0.12, 0.12),
      });
      x += item.font.widthOfTextAtSize(item.word, item.size);
    } catch {
      // Fallback
      x += item.size * 0.5 * item.word.length;
    }
  }
}

/**
 * Converts a single input file into a PDFDocument.
 */
async function convertInputToPdf(
  input: { name: string; data: Uint8Array },
  rotation = 0,
  pageSize: "a4" | "letter" = "a4"
): Promise<PDFDocument> {
  // 1. If already a PDF, load directly and apply rotation
  if (isPdfBuffer(input.data) || input.name.toLowerCase().endsWith(".pdf")) {
    const doc = await PDFDocument.load(input.data, { ignoreEncryption: true });
    const normRot = ((rotation % 360) + 360) % 360;
    if (normRot !== 0) {
      const count = doc.getPageCount();
      for (let i = 0; i < count; i++) {
        const page = doc.getPage(i);
        const currentRot = page.getRotation().angle;
        page.setRotation(degrees((currentRot + normRot) % 360));
      }
    }
    return doc;
  }

  // 2. Try parsing as DOCX (zip containing word/document.xml)
  try {
    const JSZip = (JSZipModule as any).default ?? JSZipModule;
    const zip = await JSZip.loadAsync(input.data);
    const docXmlFile = zip.file("word/document.xml");
    if (docXmlFile) {
      const xml = await docXmlFile.async("text");
      const paragraphs = parseDocxXml(xml);
      return await renderParagraphsToPdf(paragraphs, pageSize, rotation);
    }
  } catch {
    // Fall back to plain text extraction
  }

  // 3. Fallback for binary .doc or plain text
  const fallbackParagraphs = extractPlainTextParagraphs(input.data);
  return await renderParagraphsToPdf(fallbackParagraphs, pageSize, rotation);
}

function resolveOutputPdfName(fileName: string): string {
  const base = fileName.replace(/\.(docx|doc|pdf|txt)$/i, "");
  return `${base || "document"}.pdf`;
}

const mod: ToolModule<WordToPdfOptions> = {
  manifest,
  async run(inputs, opts = {}, ctx?: RunContext): Promise<OutputFile[]> {
    if (!inputs || inputs.length === 0) {
      throw new ToolError("At least one Word document (.docx, .doc) or PDF is required.");
    }

    checkAborted(ctx?.signal);
    ctx?.onProgress?.(0.05);

    const globalDegrees = opts.degrees ?? 0;
    const rotations = opts.rotations ?? {};
    const pageSize = opts.pageSize ?? "a4";
    const mergeAll = opts.mergeAll ?? false;

    // Helper to get rotation for file
    const getRotationFor = (idx: number, name: string): number => {
      if (typeof rotations[name] === "number") return rotations[name];
      if (typeof rotations[idx] === "number") return rotations[idx];
      return globalDegrees;
    };

    if (mergeAll) {
      // Merge all converted files into a single PDF
      const combinedDoc = await PDFDocument.create();

      for (let i = 0; i < inputs.length; i++) {
        checkAborted(ctx?.signal);
        const input = inputs[i];
        const rot = getRotationFor(i, input.name);
        const singleDoc = await convertInputToPdf(input, rot, pageSize);
        checkAborted(ctx?.signal);

        const pageIndices = singleDoc.getPageIndices();
        const copied = await combinedDoc.copyPages(singleDoc, pageIndices);
        for (const page of copied) {
          combinedDoc.addPage(page);
        }

        ctx?.onProgress?.(0.05 + ((i + 1) / inputs.length) * 0.85);
      }

      checkAborted(ctx?.signal);
      const data = await combinedDoc.save();
      ctx?.onProgress?.(1.0);

      const outName = opts.outputName?.trim()
        ? resolveOutputPdfName(opts.outputName)
        : "converted.pdf";

      return [{ name: outName, mime: "application/pdf", data }];
    }

    // Convert each file to its own PDF output
    const outputs: OutputFile[] = [];

    for (let i = 0; i < inputs.length; i++) {
      checkAborted(ctx?.signal);
      const input = inputs[i];
      const rot = getRotationFor(i, input.name);
      const singleDoc = await convertInputToPdf(input, rot, pageSize);
      checkAborted(ctx?.signal);

      const data = await singleDoc.save();
      const outName = resolveOutputPdfName(input.name);
      outputs.push({
        name: outName,
        mime: "application/pdf",
        data,
      });

      ctx?.onProgress?.(0.05 + ((i + 1) / inputs.length) * 0.95);
    }

    checkAborted(ctx?.signal);
    ctx?.onProgress?.(1.0);
    return outputs;
  },
};

export default mod;
