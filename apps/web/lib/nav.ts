import type { ToolManifest } from "@pdfkit/core";
import { manifests } from "./registry.ts";

export const SEARCH_DEBOUNCE_MS = 300;

export interface NavLinkItem {
  href: string;
  label: string;
}

/**
 * Derives navigation links dynamically from registered tool manifests.
 */
export function deriveNavLinks(toolManifests: ToolManifest[] = manifests): NavLinkItem[] {
  return [
    { href: "/", label: "All Tools" },
    ...toolManifests.map((m) => ({
      href: `/tools/${m.id}`,
      label: m.title,
    })),
  ];
}

export type SearchNavigationAction = "replace" | "push" | "none";

export interface SearchTargetResult {
  action: SearchNavigationAction;
  url: string;
}

/**
 * Determines whether and how to update the route given the query, pathname, and current search params.
 */
export function buildSearchTarget(
  query: string,
  pathname: string,
  currentSearchParams: URLSearchParams
): SearchTargetResult {
  const trimmed = query.trim();
  const currentQ = (currentSearchParams.get("q") ?? "").trim();

  if (pathname === "/") {
    if (trimmed === currentQ) {
      return { action: "none", url: "/" };
    }
    const params = new URLSearchParams(currentSearchParams.toString());
    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }
    const qs = params.toString();
    return { action: "replace", url: qs ? `/?${qs}` : "/" };
  }

  // On tool pages or other subroutes
  if (!trimmed) {
    return { action: "none", url: pathname };
  }
  return { action: "push", url: `/?q=${encodeURIComponent(trimmed)}` };
}

// ---------------------------------------------------------------------------
// Grouped mega-menu navigation
// ---------------------------------------------------------------------------

export interface NavGroupItem {
  /** Display label, e.g. "Merge PDF" */
  label: string;
  /** Route path. null = coming soon (not yet active). */
  href: string | null;
}

export interface NavGroup {
  /** Category heading, e.g. "Organize PDF" */
  label: string;
  items: NavGroupItem[];
}

/**
 * Static grouped nav definition.
 * Active tools reference real routes; planned tools have href: null.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Organize PDF",
    items: [
      { label: "Merge PDF",     href: "/tools/merge" },
      { label: "Split PDF",     href: "/tools/split" },
      { label: "Remove Pages",  href: "/tools/remove" },
      { label: "Extract Pages", href: "/tools/extract" },
      { label: "Organize PDF",  href: "/tools/organize" },
      { label: "Scan to PDF",   href: null },
    ],
  },
  {
    label: "Optimize PDF",
    items: [
      { label: "Compress PDF",  href: null },
      { label: "Repair PDF",    href: null },
      { label: "OCR PDF",       href: null },
    ],
  },
  {
    label: "Convert to PDF",
    items: [
      { label: "JPG to PDF",        href: null },
      { label: "Word to PDF",       href: null },
      { label: "PowerPoint to PDF", href: null },
      { label: "Excel to PDF",      href: null },
      { label: "HTML to PDF",       href: null },
    ],
  },
  {
    label: "Convert from PDF",
    items: [
      { label: "PDF to JPG",        href: null },
      { label: "PDF to Word",       href: null },
      { label: "PDF to PowerPoint", href: null },
      { label: "PDF to Excel",      href: null },
      { label: "PDF to PDF/A",      href: null },
    ],
  },
  {
    label: "Edit PDF",
    items: [
      { label: "Rotate PDF",       href: "/tools/rotate" },
      { label: "Add Page Numbers", href: null },
      { label: "Add Watermark",    href: null },
      { label: "Crop PDF",         href: null },
    ],
  },
  {
    label: "PDF Security",
    items: [
      { label: "Unlock PDF",   href: null },
      { label: "Protect PDF",  href: null },
      { label: "Sign PDF",     href: null },
      { label: "Redact PDF",   href: null },
      { label: "Compare PDF",  href: null },
    ],
  },
  {
    label: "PDF Intelligence",
    items: [
      { label: "AI Summarizer",   href: null },
      { label: "Translate PDF",   href: null },
      { label: "PDF to Markdown", href: null },
    ],
  },
];
