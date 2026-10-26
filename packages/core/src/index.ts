/** The contract every tool module implements. Modules depend ONLY on this package. */
export type Category = "organize" | "edit" | "convert" | "security" | "ocr";

export type FieldDef =
  | { key: string; label: string; type: "text"; default?: string; help?: string; placeholder?: string }
  | { key: string; label: string; type: "number"; default?: number; min?: number; max?: number; help?: string }
  | { key: string; label: string; type: "checkbox"; default?: boolean; help?: string }
  | { key: string; label: string; type: "select"; default?: string; options: { value: string; label: string }[]; help?: string };

export type ToolStatus = "active" | "planned" | "beta";

/** Lightweight, import-safe metadata. Must NOT import heavy libraries. */
export interface ToolManifest {
  id: string;
  title: string;
  description: string;
  category: Category;
  backend: "client" | "server" | "hybrid";
  accepts: string[];     // MIME types
  multiple: boolean;     // accepts several input files
  fields: FieldDef[];
  status?: ToolStatus;
  related?: string[];
}

export interface OutputFile { name: string; mime: string; data: Uint8Array }

export interface RunContext {
  onProgress(fraction: number): void;
  signal: AbortSignal;
}

export interface ToolModule<O = Record<string, any>> {
  manifest: ToolManifest;
  run(inputs: { name: string; data: Uint8Array }[], opts: O, ctx: RunContext): Promise<OutputFile[]>;
}

export class ToolError extends Error {}

export class PageRangeError extends ToolError {
  readonly token?: string;
  constructor(message: string, token?: string) {
    super(message);
    this.name = "PageRangeError";
    this.token = token;
  }
}

export class PayloadLimitError extends ToolError {
  readonly code: "FILE_TOO_LARGE" | "TOO_MANY_FILES" | "TOTAL_SIZE_TOO_LARGE";
  readonly limit: number;
  readonly actual: number;
  readonly fileName?: string;

  constructor(
    message: string,
    code: "FILE_TOO_LARGE" | "TOO_MANY_FILES" | "TOTAL_SIZE_TOO_LARGE",
    limit: number,
    actual: number,
    fileName?: string
  ) {
    super(message);
    this.name = "PayloadLimitError";
    this.code = code;
    this.limit = limit;
    this.actual = actual;
    this.fileName = fileName;
  }
}

export interface PayloadLimits {
  /** Maximum allowed size in bytes for a single file. Default: 100 MB (104,857,600 bytes). */
  maxFileSizeBytes?: number;
  /** Maximum aggregate size in bytes across all files. Default: 250 MB (262,144,000 bytes). */
  maxTotalSizeBytes?: number;
  /** Maximum number of files. Default: 50. */
  maxFileCount?: number;
  /** Warning threshold in bytes where processing may cause memory pressure. Default: 50 MB (52,428,800 bytes). */
  warnSizeBytes?: number;
}

export const DEFAULT_PAYLOAD_LIMITS: Required<PayloadLimits> = {
  maxFileSizeBytes: 100 * 1024 * 1024,
  maxTotalSizeBytes: 250 * 1024 * 1024,
  maxFileCount: 50,
  warnSizeBytes: 50 * 1024 * 1024,
};

export interface FilePayloadInfo {
  readonly name: string;
  readonly size?: number;
  readonly data?: { readonly byteLength: number } | Uint8Array;
}

function formatByteSize(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Validates file size, total payload size, and file count against configured limits.
 * Throws PayloadLimitError with actionable error messages if limits are exceeded.
 */
export function validatePayloadLimits(
  files: readonly FilePayloadInfo[],
  customLimits?: PayloadLimits
): void {
  const limits = { ...DEFAULT_PAYLOAD_LIMITS, ...customLimits };

  if (files.length > limits.maxFileCount) {
    throw new PayloadLimitError(
      `Too many files: maximum allowed is ${limits.maxFileCount} files (received ${files.length}).`,
      "TOO_MANY_FILES",
      limits.maxFileCount,
      files.length
    );
  }

  let totalSize = 0;
  for (const f of files) {
    const size = typeof f.size === "number" ? f.size : (f.data ? f.data.byteLength : 0);
    if (size > limits.maxFileSizeBytes) {
      throw new PayloadLimitError(
        `File "${f.name}" (${formatByteSize(size)}) exceeds the maximum allowed size of ${formatByteSize(limits.maxFileSizeBytes)}.`,
        "FILE_TOO_LARGE",
        limits.maxFileSizeBytes,
        size,
        f.name
      );
    }
    totalSize += size;
  }

  if (totalSize > limits.maxTotalSizeBytes) {
    throw new PayloadLimitError(
      `Total files size (${formatByteSize(totalSize)}) exceeds the maximum allowed total of ${formatByteSize(limits.maxTotalSizeBytes)}.`,
      "TOTAL_SIZE_TOO_LARGE",
      limits.maxTotalSizeBytes,
      totalSize
    );
  }
}

/**
 * Returns a user-facing memory warning string if the files approach memory pressure,
 * or null if below the warning threshold.
 */
export function getPayloadMemoryWarning(
  files: readonly FilePayloadInfo[],
  customLimits?: PayloadLimits
): string | null {
  const limits = { ...DEFAULT_PAYLOAD_LIMITS, ...customLimits };
  let totalSize = 0;
  for (const f of files) {
    const size = typeof f.size === "number" ? f.size : (f.data ? f.data.byteLength : 0);
    totalSize += size;
  }

  const isLargeSize = totalSize >= limits.warnSizeBytes;
  const isLargeCount = files.length >= 20;

  if (isLargeSize || isLargeCount) {
    const totalFormatted = formatByteSize(totalSize);
    return `Large operation (${files.length} file${files.length === 1 ? "" : "s"}, ${totalFormatted}): Processing large documents may consume significant browser memory.`;
  }
  return null;
}

export interface PageRangeOptions {
  /**
   * "strict" (default): throws PageRangeError on invalid tokens, out of bounds, 0, or reversed ranges.
   * "lenient": accepts clamp and allowReversed options for interactive UI inputs.
   */
  mode?: "strict" | "lenient";
  /** In lenient mode, clamp bounds to [1, total]. In strict mode, out-of-bounds throws. Default: false */
  clamp?: boolean;
  /** In lenient mode, allow "5-3" to mean [3, 4, 5]. In strict mode, reversed range throws. Default: false */
  allowReversed?: boolean;
  /** Return 0-based page indices (true) or 1-based page numbers (false). Default: false for parsePageRanges, true for parsePageSpec. */
  zeroBased?: boolean;
  /** If input is empty/whitespace, return all pages. Default: false for parsePageRanges, true for parsePageSpec. */
  emptyReturnsAll?: boolean;
}

/** Parse a comma-separated range string into deduped, sorted page numbers or indices. */
export function parsePageRanges(
  spec: string | undefined | null,
  total: number,
  options?: PageRangeOptions
): number[] {
  if (total <= 0) return [];
  const s = (spec ?? "").trim();
  const isZeroBased = options?.zeroBased === true;
  const isLenient = options?.mode === "lenient";
  const shouldClamp = isLenient && options?.clamp === true;
  const shouldAllowReversed = isLenient && options?.allowReversed === true;

  if (!s) {
    if (options?.emptyReturnsAll) {
      return Array.from({ length: total }, (_, i) => (isZeroBased ? i : i + 1));
    }
    return [];
  }

  const out: number[] = [];
  const parts = s.split(",");

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    // Check for multi-dash input (e.g. "1-3-5")
    const dashCount = (part.match(/-/g) || []).length;
    if (dashCount > 1) {
      throw new PageRangeError(`Invalid page range: "${part}"`, part);
    }

    if (dashCount === 0) {
      // Single page token
      if (!/^\d+$/.test(part)) {
        throw new PageRangeError(`Invalid page range: "${part}"`, part);
      }
      let page = Number.parseInt(part, 10);
      if (page < 1 || page > total) {
        if (shouldClamp) {
          page = Math.max(1, Math.min(total, page));
        } else {
          throw new PageRangeError(`Range "${part}" is outside 1-${total}`, part);
        }
      }
      out.push(isZeroBased ? page - 1 : page);
      continue;
    }

    // Range token with exactly one dash (e.g. "1-3", "3-", "-2", "-")
    const [leftStr, rightStr] = part.split("-").map((t) => t.trim());
    if (!leftStr && !rightStr) {
      throw new PageRangeError(`Invalid page range: "${part}"`, part);
    }
    if (leftStr && !/^\d+$/.test(leftStr)) {
      throw new PageRangeError(`Invalid page range: "${part}"`, part);
    }
    if (rightStr && !/^\d+$/.test(rightStr)) {
      throw new PageRangeError(`Invalid page range: "${part}"`, part);
    }

    let a = leftStr ? Number.parseInt(leftStr, 10) : 1;
    let b = rightStr ? Number.parseInt(rightStr, 10) : total;

    if (leftStr && rightStr && a > b) {
      if (shouldAllowReversed) {
        [a, b] = [b, a];
      } else {
        throw new PageRangeError(`Range "${part}" is outside 1-${total}`, part);
      }
    }

    if (a < 1 || b > total) {
      if (shouldClamp) {
        a = Math.max(1, Math.min(total, a));
        b = Math.max(1, Math.min(total, b));
      } else {
        throw new PageRangeError(`Range "${part}" is outside 1-${total}`, part);
      }
    }

    for (let i = a; i <= b; i++) {
      out.push(isZeroBased ? i - 1 : i);
    }
  }

  return Array.from(new Set(out)).sort((a, b) => a - b);
}

/** "1-3,5,8-" -> zero-based page indexes (deduped, in order). Backward compatible wrapper. */
export function parsePageSpec(
  spec: string | undefined | null,
  total: number,
  options?: PageRangeOptions
): number[] {
  return parsePageRanges(spec, total, {
    mode: "strict",
    zeroBased: true,
    emptyReturnsAll: true,
    ...options,
  });
}

/** Format a list of 1-based page numbers into a compact range string (e.g. "1-3, 5"). */
export function formatPageRanges(pages: Iterable<number>): string {
  const sorted = Array.from(new Set(Array.from(pages).filter((p) => Number.isInteger(p) && p > 0))).sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const intervals: [number, number][] = [];

  for (const page of sorted) {
    const last = intervals[intervals.length - 1];
    if (last && page === last[1] + 1) {
      last[1] = page;
    } else {
      intervals.push([page, page]);
    }
  }

  return intervals
    .map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`))
    .join(", ");
}

/** Format a list of 0-based page indices into a 1-based compact range string (e.g. "1-3, 5"). */
export function formatPageIndices(indices: Iterable<number>): string {
  const pages = Array.from(indices).map((i) => i + 1);
  return formatPageRanges(pages);
}

export function checkAborted(signal: AbortSignal) {
  if (signal.aborted) throw new ToolError("Cancelled");
}
