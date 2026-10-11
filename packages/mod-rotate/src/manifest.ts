import type { ToolManifest } from "@pdfkit/core";
export const manifest: ToolManifest = {
  id: "rotate", title: "Rotate PDF", category: "organize", backend: "client",
  description: "Rotate all pages, or only the pages you list.",
  accepts: ["application/pdf"], multiple: false,
  fields: [
    { key: "degrees", label: "Rotate by", type: "select", default: "90",
      options: [{ value: "90", label: "90° clockwise" }, { value: "180", label: "180°" }, { value: "270", label: "90° counter-clockwise" }] },
    { key: "pages", label: "Pages (blank = all)", type: "text", default: "", placeholder: "1,3-5" },
  ],
};
