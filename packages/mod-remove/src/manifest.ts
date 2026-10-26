import type { ToolManifest } from "@pdfkit/core";

export const manifest: ToolManifest = {
  id: "remove",
  title: "Remove Pages",
  category: "organize",
  backend: "client",
  description: "Delete specific pages or page ranges from your PDF document with visual preview.",
  accepts: ["application/pdf"],
  multiple: false,
  fields: [
    {
      key: "pages",
      label: "Pages to Remove",
      type: "text",
      default: "",
      placeholder: "e.g. 1, 3-5",
      help: "Enter page numbers or ranges to remove.",
    },
  ],
  related: ["extract", "split", "organize"],
};
