import type { ToolManifest } from "@pdfkit/core";

export const manifest: ToolManifest = {
  id: "organize",
  title: "Organize PDF",
  category: "organize",
  backend: "client",
  description: "Sort, add and delete PDF pages. Drag and drop page thumbnails to reorder.",
  accepts: ["application/pdf"],
  multiple: true,
  fields: [
    {
      key: "pages",
      label: "Pages JSON specification",
      type: "text",
      default: "",
      placeholder: '[{"fileIndex":0,"pageIndex":0,"rotation":0}]',
    },
  ],
};
