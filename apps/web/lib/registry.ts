import type { ToolManifest, ToolModule } from "@pdfkit/core";
import { manifest as merge } from "@pdfkit/mod-merge/manifest";
import { manifest as split } from "@pdfkit/mod-split/manifest";
import { manifest as rotate } from "@pdfkit/mod-rotate/manifest";
import { manifest as remove } from "@pdfkit/mod-remove/manifest";
import { manifest as organize } from "@pdfkit/mod-organize/manifest";
import { manifest as extract } from "@pdfkit/mod-extract/manifest";
import { manifest as jpgToPdf } from "@pdfkit/mod-jpg-to-pdf/manifest";
import { manifest as wordToPdf } from "@pdfkit/mod-word-to-pdf/manifest";

// The ONE file that wires modules into the app. Adding a tool = 2 lines here.
export const manifests: ToolManifest[] = [merge, split, rotate, remove, organize, extract, jpgToPdf, wordToPdf];

/** Heavy code is loaded lazily, only when a tool runs. */
export const loaders: Record<string, () => Promise<{ default: ToolModule<any> }>> = {
  merge: () => import("@pdfkit/mod-merge"),
  split: () => import("@pdfkit/mod-split"),
  rotate: () => import("@pdfkit/mod-rotate"),
  remove: () => import("@pdfkit/mod-remove"),
  organize: () => import("@pdfkit/mod-organize"),
  extract: () => import("@pdfkit/mod-extract"),
  "jpg-to-pdf": () => import("@pdfkit/mod-jpg-to-pdf"),
  "png-to-pdf": () => import("@pdfkit/mod-jpg-to-pdf"),
  "word-to-pdf": () => import("@pdfkit/mod-word-to-pdf"),
};
