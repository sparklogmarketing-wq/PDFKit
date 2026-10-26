import type { Metadata } from "next";
import type { ToolManifest } from "@pdfkit/core";
import { manifests } from "./registry.ts";

/**
 * Builds SEO and social graph metadata for a specific tool manifest.
 */
export function getToolMetadata(manifest: ToolManifest | undefined): Metadata {
  if (!manifest) {
    return {
      title: "Tool Not Found | PDFKit",
      description: "The requested PDF tool was not found.",
    };
  }
  return {
    title: manifest.title,
    description: manifest.description,
    openGraph: {
      title: `${manifest.title} - Free Online PDF Tool | PDFKit`,
      description: manifest.description,
      type: "website",
    },
  };
}

/**
 * Resolves tool manifest by ID and returns generated metadata.
 */
export function getToolMetadataById(id: string): Metadata {
  const manifest = manifests.find((m) => m.id === id);
  return getToolMetadata(manifest);
}
