import type { ToolManifest } from "@pdfkit/core";
export const manifest: ToolManifest = {
  id: "merge", title: "Merge PDF", category: "organize", backend: "client",
  description: "Combine several PDFs into one, in the order you choose.",
  accepts: ["application/pdf"], multiple: true, fields: [],
  status: "active",
  related: ["split", "organize", "rotate"],
};
