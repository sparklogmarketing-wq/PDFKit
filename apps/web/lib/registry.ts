import type { ToolManifest, ToolModule } from "@pdfkit/core";
import { manifest as merge } from "@pdfkit/mod-merge/manifest";
import { manifest as split } from "@pdfkit/mod-split/manifest";
import { manifest as rotate } from "@pdfkit/mod-rotate/manifest";

// The ONE file that wires modules into the app. Adding a tool = 2 lines here.
export const manifests: ToolManifest[] = [merge, split, rotate];

/** Heavy code is loaded lazily, only when a tool runs. */
export const loaders: Record<string, () => Promise<{ default: ToolModule<any> }>> = {
  merge: () => import("@pdfkit/mod-merge"),
  split: () => import("@pdfkit/mod-split"),
  rotate: () => import("@pdfkit/mod-rotate"),
};
