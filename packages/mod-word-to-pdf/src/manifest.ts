import type { ToolManifest } from "@pdfkit/core";

export const manifest: ToolManifest = {
  id: "word-to-pdf",
  title: "Word to PDF",
  description: "Convert Word documents (.docx, .doc) to PDF with page rotation and file management.",
  category: "convert",
  backend: "client",
  accepts: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/pdf",
  ],
  multiple: true,
  fields: [],
  related: ["merge", "split", "rotate"],
};
