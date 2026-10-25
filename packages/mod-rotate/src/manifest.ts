import type { ToolManifest } from "@pdfkit/core";

export const manifest: ToolManifest = {
  id: "rotate",
  title: "Rotate PDF",
  category: "organize",
  backend: "client",
  description: "Rotate PDF pages clockwise or counter-clockwise, choose specific ranges, or exclude pages.",
  accepts: ["application/pdf"],
  multiple: true,
  fields: [
    {
      key: "degrees",
      label: "Rotate by",
      type: "select",
      default: "90",
      options: [
        { value: "90", label: "90° Right (Clockwise)" },
        { value: "270", label: "90° Left (Counter-Clockwise)" },
        { value: "180", label: "180° (Half turn)" },
      ],
    },
    {
      key: "pages",
      label: "Pages to Rotate (blank = all)",
      type: "text",
      default: "",
      placeholder: "e.g. 1-3, 5",
      help: "Leave blank to rotate all pages, or enter page numbers/ranges.",
    },
    {
      key: "excludePages",
      label: "Pages to NOT Rotate (Exclude)",
      type: "text",
      default: "",
      placeholder: "e.g. 2, 4-6",
      help: "Pages or ranges that will remain unchanged.",
    },
  ],
  status: "active",
  related: ["organize", "split", "merge"],
};

