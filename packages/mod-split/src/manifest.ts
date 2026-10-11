import type { ToolManifest } from "@pdfkit/core";
export const manifest: ToolManifest = {
  id: "split", title: "Split PDF", category: "organize", backend: "client",
  description: "Cut a PDF into several files by page ranges or every N pages.",
  accepts: ["application/pdf"], multiple: false,
  fields: [
    { key: "mode", label: "Split by", type: "select", default: "ranges",
      options: [{ value: "ranges", label: "Page ranges" }, { value: "every", label: "Every N pages" }] },
    { key: "ranges", label: "Ranges (one file per comma group)", type: "text", default: "1-3,4-", placeholder: "1-3,4-" },
    { key: "n", label: "N (for every N pages)", type: "number", default: 1, min: 1 },
  ],
};
