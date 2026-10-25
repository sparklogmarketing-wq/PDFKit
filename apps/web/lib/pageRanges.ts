/**
 * Shared page-range utilities used across tools and test suites.
 * Pure functions with no browser/React dependencies.
 */

function clampBound(val: number, fallback: number, max: number): number {
  const n = Number.isFinite(val) && val > 0 ? val : fallback;
  return Math.min(Math.max(1, Math.floor(n)), max);
}

/** Expand a single range token (e.g. "2-4" or "3") into 1-based page numbers. */
export function expandRangeToken(token: string, maxPages: number): number[] {
  const dashIndex = token.indexOf("-");
  if (dashIndex === -1) {
    const page = Number.parseInt(token, 10);
    return page >= 1 && page <= maxPages ? [page] : [];
  }

  const left = token.slice(0, dashIndex).trim();
  const right = token.slice(dashIndex + 1).trim();
  const start = clampBound(Number.parseInt(left, 10), 1, maxPages);
  const end = clampBound(Number.parseInt(right, 10), maxPages, maxPages);
  const [minPage, maxPage] = start <= end ? [start, end] : [end, start];

  const pages: number[] = [];
  for (let p = minPage; p <= maxPage; p++) {
    pages.push(p);
  }
  return pages;
}

/** Parse a comma-separated page range string into a Set of 1-based page numbers. */
export function parsePageRanges(text: string, maxPages: number): Set<number> {
  const selected = new Set<number>();
  if (!text?.trim() || maxPages <= 0) return selected;

  for (const token of text.split(",")) {
    const cleaned = token.trim();
    if (!cleaned) continue;
    for (const page of expandRangeToken(cleaned, maxPages)) {
      selected.add(page);
    }
  }

  return selected;
}

/** Format a list of 1-based page numbers into a compact range string (e.g. "1-3, 5"). */
export function formatPageRanges(pages: number[]): string {
  if (pages.length === 0) return "";
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
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
