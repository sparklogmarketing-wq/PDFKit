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
