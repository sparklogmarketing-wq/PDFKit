/**
 * Shared page-range utilities used by ExtractTool and test suites.
 * Pure functions with no browser/React dependencies.
 */

/** Expand a single hyphenated range token (e.g. "2-4") into 1-based page numbers. */
export function expandRangeToken(token: string, maxPages: number): number[] {
  const [startStr, endStr] = token.split("-");
  const start = Math.max(1, Math.min(maxPages, Number(startStr?.trim()) || 1));
  const end = endStr?.trim()
    ? Math.max(1, Math.min(maxPages, Number(endStr.trim()) || maxPages))
    : maxPages;
  const [from, to] = start <= end ? [start, end] : [end, start];
  const pages: number[] = [];
  for (let p = from; p <= to; p++) pages.push(p);
  return pages;
}

/** Parse a comma-separated page range string into a Set of 1-based page numbers. */
export function parsePageRanges(text: string, maxPages: number): Set<number> {
  const result = new Set<number>();
  if (!text?.trim()) return result;
  for (const part of text.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      for (const p of expandRangeToken(trimmed, maxPages)) result.add(p);
    } else {
      const p = Number(trimmed);
      if (p >= 1 && p <= maxPages) result.add(p);
    }
  }
  return result;
}

/** Format a list of 1-based page numbers into a compact range string (e.g. "1-3, 5"). */
export function formatPageRanges(pages: number[]): string {
  if (pages.length === 0) return "";
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = cur;
      prev = cur;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(", ");
}
