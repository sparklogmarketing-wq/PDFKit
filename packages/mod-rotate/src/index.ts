import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { checkAborted, parsePageSpec, ToolError, type ToolModule, type OutputFile, type RunContext } from "@pdfkit/core";
import { manifest } from "./manifest.ts";

export interface CustomRotationRule {
  readonly pages: string;
  readonly degrees: string | number;
}

export interface RotateOptions {
  readonly degrees?: string | number;
  readonly direction?: string;
  readonly pages?: string;
  readonly excludePages?: string;
  readonly customRotations?: CustomRotationRule[];
  readonly pageRotations?: Record<string | number, number | string>;
  readonly fileRotations?: Record<string | number, {
    readonly pageRotations?: Record<string | number, number | string>;
    readonly customRotations?: CustomRotationRule[];
    readonly excludePages?: string;
    readonly pages?: string;
    readonly degrees?: string | number;
  }>;
}

function parseDegrees(val: string | number | undefined, defaultDeg = 90): number {
  if (val === undefined || val === null || val === "") return defaultDeg;
  if (typeof val === "string") {
    const lower = val.trim().toLowerCase();
    if (lower === "right") return 90;
    if (lower === "left") return 270;
  }
  const n = Number(val);
  if (Number.isNaN(n)) return defaultDeg;
  return ((n % 360) + 360) % 360;
}

function buildCustomRulesMap(rules: readonly CustomRotationRule[], totalPages: number): Map<number, number> {
  const map = new Map<number, number>();
  for (const rule of rules) {
    if (!rule.pages?.trim()) continue;
    const ruleDelta = parseDegrees(rule.degrees, 0);
    try {
      const ruleIndices = parsePageSpec(rule.pages, totalPages);
      for (const idx of ruleIndices) {
        map.set(idx, ruleDelta);
      }
    } catch {
      // If a custom range is invalid for this file, skip rule gracefully
    }
  }
  return map;
}

function computePageDelta(
  pageIndex: number,
  filePageRotations: Record<string | number, number | string>,
  customRulesMap: Map<number, number>,
  excludedIndices: Set<number>,
  targetIndices: Set<number>,
  fileBaseDegrees: number
): number {
  // 1. Explicit per-page rotation
  const explicitPageVal =
    filePageRotations[pageIndex] ??
    filePageRotations[pageIndex + 1] ??
    filePageRotations[String(pageIndex)] ??
    filePageRotations[String(pageIndex + 1)];

  if (explicitPageVal !== undefined && explicitPageVal !== null && explicitPageVal !== "") {
    return parseDegrees(explicitPageVal, 0);
  }
  // 2. Custom range rule for this page
  if (customRulesMap.has(pageIndex)) {
    return customRulesMap.get(pageIndex)!;
  }
  // 3. Excluded pages (remain at 0 delta)
  if (excludedIndices.has(pageIndex)) {
    return 0;
  }
  // 4. Base rotation applied to target pages
  if (targetIndices.has(pageIndex)) {
    return fileBaseDegrees;
  }
  return 0;
}

async function processPdfFile(
  file: { readonly name: string; readonly data: Uint8Array },
  fIdx: number,
  totalFiles: number,
  opts: RotateOptions,
  defaultDelta: number,
  ctx: RunContext
): Promise<OutputFile> {
  checkAborted(ctx.signal);
  const doc = await PDFDocument.load(file.data);
  const pages = doc.getPages();
  const totalPages = pages.length;

  const fileOverrides = opts.fileRotations?.[fIdx] ?? opts.fileRotations?.[file.name];
  const fileBaseDegrees = fileOverrides?.degrees !== undefined
    ? parseDegrees(fileOverrides.degrees, defaultDelta)
    : defaultDelta;

  const filePagesSpec = fileOverrides?.pages ?? opts.pages;
  const fileExcludeSpec = fileOverrides?.excludePages ?? opts.excludePages;
  const fileCustomRules = fileOverrides?.customRotations ?? opts.customRotations ?? [];
  const filePageRotations = fileOverrides?.pageRotations ?? opts.pageRotations ?? {};

  const targetIndices = new Set(parsePageSpec(filePagesSpec, totalPages));
  const excludedIndices = new Set(
    fileExcludeSpec?.trim() ? parsePageSpec(fileExcludeSpec, totalPages) : []
  );
  const customRulesMap = buildCustomRulesMap(fileCustomRules, totalPages);

  for (let i = 0; i < totalPages; i++) {
    checkAborted(ctx.signal);
    const delta = computePageDelta(
      i,
      filePageRotations,
      customRulesMap,
      excludedIndices,
      targetIndices,
      fileBaseDegrees
    );

    if (delta !== 0) {
      const cur = pages[i].getRotation().angle;
      pages[i].setRotation(degrees(((cur + delta) % 360 + 360) % 360));
    }

    ctx.onProgress((fIdx + (i + 1) / totalPages) / totalFiles);
  }

  checkAborted(ctx.signal);
  const savedData = await doc.save();
  const outputName = file.name.replace(/\.pdf$/i, "") + "-rotated.pdf";
  return {
    name: outputName,
    mime: "application/pdf",
    data: savedData,
  };
}

const mod: ToolModule<RotateOptions> = {
  manifest,
  async run(inputs, opts, ctx) {
    checkAborted(ctx.signal);
    if (!inputs || inputs.length === 0) {
      throw new ToolError("No PDF files provided to rotate");
    }

    const defaultDelta = parseDegrees(opts.degrees ?? opts.direction, 90);
    const results = await Promise.all(
      inputs.map((input, fIdx) =>
        processPdfFile(input, fIdx, inputs.length, opts, defaultDelta, ctx)
      )
    );

    checkAborted(ctx.signal);
    return results;
  },
};

export default mod;
