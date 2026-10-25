/**
 * Shared page-range utilities used across tools and test suites.
 * Consolidated implementation backed by @pdfkit/core.
 */
import {
  parsePageRanges as coreParsePageRanges,
  formatPageRanges as coreFormatPageRanges,
  formatPageIndices as coreFormatPageIndices,
  PageRangeError,
  type PageRangeOptions,
} from "@pdfkit/core";

export {
  coreFormatPageRanges as formatPageRanges,
  coreFormatPageIndices as formatPageIndices,
  PageRangeError,
  type PageRangeOptions,
};

/** Parse a comma-separated page range string into a Set of 1-based page numbers. */
export function parsePageRanges(
  text: string,
  maxPages: number,
  options?: PageRangeOptions
): Set<number> {
  if (!text?.trim() || maxPages <= 0) return new Set<number>();
  try {
    const pages = coreParsePageRanges(text, maxPages, {
      mode: "lenient",
      clamp: true,
      allowReversed: true,
      ...options,
    });
    return new Set(pages);
  } catch {
    return new Set<number>();
  }
}
