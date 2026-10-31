import type { ToolManifest } from "@pdfkit/core";

export const manifest: ToolManifest = {
  id: "jpg-to-pdf",
  title: "JPG to PDF",
  description: "Convert JPG and PNG images into high-quality PDF documents with customizable page size, orientation, and margins.",
  category: "convert",
  backend: "client",
  accepts: ["image/png", "image/jpeg"],
  multiple: true,
  fields: [
    {
      key: "pageSize",
      label: "Page Size",
      type: "select",
      default: "a4",
      options: [
        { value: "a4", label: "A4 (297 × 210 mm)" },
        { value: "letter", label: "US Letter (8.5 × 11 in)" },
        { value: "fit", label: "Fit (Same as image)" },
      ],
    },
    {
      key: "orientation",
      label: "Page Orientation",
      type: "select",
      default: "portrait",
      options: [
        { value: "portrait", label: "Portrait" },
        { value: "landscape", label: "Landscape" },
      ],
    },
    {
      key: "margin",
      label: "Margin",
      type: "select",
      default: "none",
      options: [
        { value: "none", label: "No Margin (0 pt)" },
        { value: "small", label: "Small (20 pt)" },
        { value: "large", label: "Big (40 pt)" },
      ],
    },
    {
      key: "mergeAll",
      label: "Merge all images in one PDF file",
      type: "checkbox",
      default: true,
      help: "Merge all uploaded images into a single PDF document in the order listed.",
    },
    {
      key: "outputName",
      label: "Output filename",
      type: "text",
      default: "",
      placeholder: "converted.pdf",
    },
  ],
  related: ["organize", "merge", "split"],
};
