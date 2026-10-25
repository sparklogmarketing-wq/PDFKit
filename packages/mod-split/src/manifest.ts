import type { ToolManifest } from "@pdfkit/core";

export const DEFAULT_MAX_SIZE_BYTES = 500000;

export const manifest: ToolManifest = {
  id: "split", title: "Split PDF", category: "organize", backend: "client",
  description: "Cut a PDF into several files by page ranges, every N pages, or maximum file size.",
  accepts: ["application/pdf"], multiple: false,
  fields: [
    { key: "mode", label: "Split by", type: "select", default: "ranges",
      options: [
        { value: "ranges", label: "Page ranges" },
        { value: "every", label: "Every N pages" },
        { value: "size", label: "Maximum file size" }
      ] },
    { key: "ranges", label: "Ranges (one file per comma group)", type: "text", default: "1-3,4-", placeholder: "1-3,4-" },
    { key: "n", label: "N (for every N pages)", type: "number", default: 1, min: 1 },
    { key: "maxSizeBytes", label: "Max size in bytes", type: "number", default: DEFAULT_MAX_SIZE_BYTES },
    { key: "allowCompression", label: "Allow compression", type: "checkbox", default: true },
    { key: "mergeAll", label: "Merge all ranges in one PDF", type: "checkbox", default: false },
  ],
  status: "active",
  related: ["merge", "extract", "remove"],
};
