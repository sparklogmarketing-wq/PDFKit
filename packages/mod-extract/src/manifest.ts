import type { ToolManifest } from "@pdfkit/core";

export const manifest: ToolManifest = {
  id: "extract",
  title: "Extract Pages",
  category: "organize",
  backend: "client",
  description: "Extract specific pages from a PDF document into a single file or separate PDF pages.",
  accepts: ["application/pdf"],
  multiple: false,
  fields: [
    {
      key: "mode",
      label: "Extract mode",
      type: "select",
      default: "select",
      options: [
        { value: "select", label: "Selected pages" },
        { value: "all", label: "All pages as separate PDFs" },
      ],
    },
    {
      key: "pages",
      label: "Pages to extract (e.g. 1, 3-5)",
      type: "text",
      default: "",
      placeholder: "1, 3-5",
    },
    {
      key: "mergeAll",
      label: "Merge extracted pages into one PDF",
      type: "checkbox",
      default: true,
      help: "Merge extracted pages into one PDF (defaults to true for 'select' mode, and false for 'all' mode).",
    },
    {
      key: "outputName",
      label: "Output filename",
      type: "text",
      default: "",
    },
  ],
  related: ["split", "remove", "merge"],
};
