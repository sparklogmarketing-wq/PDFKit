"use client";

import dynamic from "next/dynamic";
import type { ComponentType, ReactNode } from "react";
import type { ToolManifest } from "@pdfkit/core";

export function ToolLoadingSkeleton() {
  return (
    <div
      className="tool-workspace-shell animate-pulse"
      style={{
        minHeight: "360px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-secondary)",
      }}
      aria-busy="true"
      aria-label="Loading tool workspace"
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
        <div
          style={{
            width: "2rem",
            height: "2rem",
            borderRadius: "50%",
            border: "2px solid var(--border-light)",
            borderTopColor: "var(--primary)",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Loading tool workspace…</span>
      </div>
    </div>
  );
}

// Registry of dynamically loaded tool components with ssr: false.
// Each tool is code-split into its own bundle chunk, loaded on-demand in the browser.
export const toolComponentMap: Record<string, ComponentType<any>> = {
  merge: dynamic(() => import("../components/MergeTool"), {
    ssr: false,
    loading: ToolLoadingSkeleton,
  }),
  split: dynamic(() => import("../components/SplitTool"), {
    ssr: false,
    loading: ToolLoadingSkeleton,
  }),
  rotate: dynamic(() => import("../components/RotateTool"), {
    ssr: false,
    loading: ToolLoadingSkeleton,
  }),
  remove: dynamic(() => import("../components/RemoveTool"), {
    ssr: false,
    loading: ToolLoadingSkeleton,
  }),
  organize: dynamic(() => import("../components/OrganizeTool"), {
    ssr: false,
    loading: ToolLoadingSkeleton,
  }),
  extract: dynamic(() => import("../components/ExtractTool"), {
    ssr: false,
    loading: ToolLoadingSkeleton,
  }),
  "jpg-to-pdf": dynamic(() => import("../components/JpgToPdfTool"), {
    ssr: false,
    loading: ToolLoadingSkeleton,
  }),
  "png-to-pdf": dynamic(() => import("../components/JpgToPdfTool"), {
    ssr: false,
    loading: ToolLoadingSkeleton,
  }),
  "word-to-pdf": dynamic(() => import("../components/WordToPdfTool"), {
    ssr: false,
    loading: ToolLoadingSkeleton,
  }),
};

// Generic ToolRunner fallback is also loaded dynamically so it is not bundled into the route chunk
export const DynamicToolRunner = dynamic(() => import("../components/ToolRunner"), {
  ssr: false,
  loading: ToolLoadingSkeleton,
});

export function ToolView({ id, manifest }: { readonly id: string; readonly manifest: ToolManifest }): ReactNode {
  const Component = toolComponentMap[id];
  if (Component) {
    return <Component />;
  }
  return <DynamicToolRunner manifest={manifest} />;
}
