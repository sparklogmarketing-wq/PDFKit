import type { ToolManifest } from "@pdfkit/core";

/**
 * Returns up to 4 related tools for a given tool manifest.
 * Prioritizes explicitly configured related tools; falls back to tools in the same category.
 */
export function getRelatedTools(manifest: ToolManifest, allManifests: ToolManifest[]): ToolManifest[] {
  if (manifest.related && manifest.related.length > 0) {
    return manifest.related
      .map((rid) => allManifests.find((m) => m.id === rid))
      .filter((m): m is ToolManifest => Boolean(m))
      .slice(0, 4);
  }
  return allManifests
    .filter((m) => m.id !== manifest.id && m.category === manifest.category)
    .slice(0, 4);
}
