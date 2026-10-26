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
    ...toolManifests
      .filter((m) => !m.status || m.status === "active")
      .map((m) => ({
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
