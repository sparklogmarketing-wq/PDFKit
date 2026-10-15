import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { checkAborted, parsePageSpec, ToolError, type ToolModule, type OutputFile } from "@pdfkit/core";
import { manifest } from "./manifest.ts";

export interface CustomRotationRule {
  pages: string;
  degrees: string | number;
}

export interface RotateOptions {
  degrees?: string | number;
  direction?: string;
  pages?: string;
  excludePages?: string;
  customRotations?: CustomRotationRule[];
  pageRotations?: Record<string | number, number | string>;
  fileRotations?: Record<string | number, {
    pageRotations?: Record<string | number, number | string>;
    customRotations?: CustomRotationRule[];
    excludePages?: string;
    pages?: string;
    degrees?: string | number;
  }>;
}

function parseDegrees(val: string | number | undefined, defaultDeg = 90): number {
  if (val === undefined || val === null || val === "") return defaultDeg;
  if (typeof val === "string") {
    const lower = val.toLowerCase().trim();
    if (lower === "right") return 90;
    if (lower === "left") return 270;
  }
  const n = Number(val);
  if (isNaN(n)) return defaultDeg;
  return ((n % 360) + 360) % 360;
}

const mod: ToolModule<RotateOptions> = {
  manifest,
  async run(inputs, opts, ctx) {
    checkAborted(ctx.signal);
    if (!inputs || inputs.length === 0) {
      throw new ToolError("No PDF files provided to rotate");
    }

    const defaultDelta = parseDegrees(opts.degrees ?? opts.direction, 90);
    const results: OutputFile[] = [];

    for (let fIdx = 0; fIdx < inputs.length; fIdx++) {
      checkAborted(ctx.signal);
      const file = inputs[fIdx];
      const doc = await PDFDocument.load(file.data);
      const pages = doc.getPages();
      const totalPages = pages.length;

      // Check for file-specific overrides
      const fileOverrides = opts.fileRotations?.[fIdx] ?? opts.fileRotations?.[file.name];
      const fileBaseDegrees = fileOverrides?.degrees !== undefined
        ? parseDegrees(fileOverrides.degrees, defaultDelta)
        : defaultDelta;

      const filePagesSpec = fileOverrides?.pages !== undefined ? fileOverrides.pages : opts.pages;
      const fileExcludeSpec = fileOverrides?.excludePages !== undefined ? fileOverrides.excludePages : opts.excludePages;
      const fileCustomRules = fileOverrides?.customRotations ?? opts.customRotations ?? [];
      const filePageRotations = fileOverrides?.pageRotations ?? opts.pageRotations ?? {};

      // Parse target pages for default rotation
      const targetIndices = new Set(parsePageSpec(filePagesSpec, totalPages));

      // Parse excluded pages (pages to NOT rotate)
      const excludedIndices = new Set(
        fileExcludeSpec && fileExcludeSpec.trim() ? parsePageSpec(fileExcludeSpec, totalPages) : []
      );

      // Pre-parse custom rotation rules into page index map
      const customRulesMap = new Map<number, number>();
      for (const rule of fileCustomRules) {
        if (!rule.pages || !rule.pages.trim()) continue;
        const ruleDelta = parseDegrees(rule.degrees, 0);
        try {
          const ruleIndices = parsePageSpec(rule.pages, totalPages);
          for (const idx of ruleIndices) {
            customRulesMap.set(idx, ruleDelta);
          }
        } catch (_) {
          // If a custom range is invalid for this file, skip rule gracefully
        }
      }

      for (let i = 0; i < totalPages; i++) {
        checkAborted(ctx.signal);

        let delta = 0;
        // 1. Explicit per-page rotation (e.g. interactive card rotation)
        const explicitPageVal = filePageRotations[i] ?? filePageRotations[i + 1] ?? filePageRotations[String(i)] ?? filePageRotations[String(i + 1)];
        if (explicitPageVal !== undefined && explicitPageVal !== null && explicitPageVal !== "") {
          delta = parseDegrees(explicitPageVal, 0);
        } else if (customRulesMap.has(i)) {
          // 2. Custom range rule for this page
          delta = customRulesMap.get(i)!;
        } else if (excludedIndices.has(i)) {
          // 3. Freedom to exclude pages from rotation
          delta = 0;
        } else if (targetIndices.has(i)) {
          // 4. Base rotation applied to target pages
          delta = fileBaseDegrees;
        }

        if (delta !== 0) {
          const cur = pages[i].getRotation().angle;
          pages[i].setRotation(degrees(((cur + delta) % 360 + 360) % 360));
        }

        ctx.onProgress((fIdx + (i + 1) / totalPages) / inputs.length);
      }

      checkAborted(ctx.signal);
      const savedData = await doc.save();
      const outputName = file.name.replace(/\.pdf$/i, "") + "-rotated.pdf";
      results.push({
        name: outputName,
        mime: "application/pdf",
        data: savedData,
      });
    }

    checkAborted(ctx.signal);
    return results;
  },
};

export default mod;

