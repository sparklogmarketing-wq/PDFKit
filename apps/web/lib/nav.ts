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
  /** Optional icon identifier for rendering category-themed icons */
  iconId?: string;
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
      { label: "Merge PDF",     href: "/tools/merge",    iconId: "merge" },
      { label: "Split PDF",     href: "/tools/split",    iconId: "split" },
      { label: "Remove Pages",  href: "/tools/remove",   iconId: "remove" },
      { label: "Extract Pages", href: "/tools/extract",  iconId: "extract" },
      { label: "Organize PDF",  href: "/tools/organize", iconId: "organize" },
      { label: "Scan to PDF",   href: null,              iconId: "scan" },
    ],
  },
  {
    label: "Optimize PDF",
    items: [
      { label: "Compress PDF",  href: null, iconId: "compress" },
      { label: "Repair PDF",    href: null, iconId: "repair" },
      { label: "OCR PDF",       href: null, iconId: "ocr" },
    ],
  },
  {
    label: "Convert to PDF",
    items: [
      { label: "JPG to PDF",        href: "/tools/jpg-to-pdf",  iconId: "jpg-to-pdf" },
      { label: "Word to PDF",       href: "/tools/word-to-pdf", iconId: "word-to-pdf" },
      { label: "PowerPoint to PDF", href: null, iconId: "powerpoint-to-pdf" },
      { label: "Excel to PDF",      href: null, iconId: "excel-to-pdf" },
      { label: "HTML to PDF",       href: null, iconId: "html-to-pdf" },
    ],
  },
  {
    label: "Convert from PDF",
    items: [
      { label: "PDF to JPG",        href: null, iconId: "pdf-to-jpg" },
      { label: "PDF to Word",       href: null, iconId: "pdf-to-word" },
      { label: "PDF to PowerPoint", href: null, iconId: "pdf-to-powerpoint" },
      { label: "PDF to Excel",      href: null, iconId: "pdf-to-excel" },
      { label: "PDF to PDF/A",      href: null, iconId: "pdf-to-pdfa" },
    ],
  },
  {
    label: "Edit PDF",
    items: [
      { label: "Rotate PDF",       href: "/tools/rotate", iconId: "rotate" },
      { label: "Add Page Numbers", href: null,            iconId: "page-numbers" },
      { label: "Add Watermark",    href: null,            iconId: "watermark" },
      { label: "Crop PDF",         href: null,            iconId: "crop" },
      { label: "Edit PDF",         href: null,            iconId: "edit" },
      { label: "PDF Forms",        href: null,            iconId: "forms" },
    ],
  },
  {
    label: "PDF Security",
    items: [
      { label: "Unlock PDF",   href: null, iconId: "unlock" },
      { label: "Protect PDF",  href: null, iconId: "protect" },
      { label: "Sign PDF",     href: null, iconId: "sign" },
      { label: "Redact PDF",   href: null, iconId: "redact" },
      { label: "Compare PDF",  href: null, iconId: "compare" },
    ],
  },
  {
    label: "PDF Intelligence",
    items: [
      { label: "AI Summarizer",   href: null, iconId: "ai-summarizer" },
      { label: "Translate PDF",   href: null, iconId: "translate" },
      { label: "PDF to Markdown", href: null, iconId: "pdf-to-markdown" },
    ],
  },
];
