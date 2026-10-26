import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { formatBytes } from "../apps/web/lib/formatBytes.ts";
import { formatBytes as formatBytesReexport } from "../apps/web/lib/format.ts";
import { deriveNavLinks, buildSearchTarget, SEARCH_DEBOUNCE_MS } from "../apps/web/lib/nav.ts";
import { debounce } from "../apps/web/lib/debounce.ts";
import { manifests } from "../apps/web/lib/registry.ts";

test("Code hygiene, dead code removal, and deduplication (Issue #30)", async (t) => {
  await t.test("ThemeToggle dead component is removed", () => {
    assert.strictEqual(
      fs.existsSync("apps/web/components/ThemeToggle.tsx"),
      false,
      "apps/web/components/ThemeToggle.tsx should be deleted"
    );
  });

  await t.test("Footer component is wired into RootLayout", () => {
    assert.strictEqual(fs.existsSync("apps/web/components/Footer.tsx"), true, "Footer component must exist");
    const layoutContent = fs.readFileSync("apps/web/app/layout.tsx", "utf8");
    assert.ok(layoutContent.includes('import Footer from "../components/Footer"'), "RootLayout must import Footer");
    assert.ok(layoutContent.includes("<Footer />"), "RootLayout must render <Footer />");
  });

  await t.test("@types/jszip is removed because jszip ships built-in types", () => {
    const webPkg = JSON.parse(fs.readFileSync("apps/web/package.json", "utf8"));
    assert.strictEqual(webPkg.devDependencies?.["@types/jszip"], undefined, "@types/jszip must not be in devDependencies");
    assert.strictEqual(webPkg.dependencies?.["@types/jszip"], undefined, "@types/jszip must not be in dependencies");
  });

  await t.test("formatBytes is consolidated into a single canonical implementation", () => {
    // format.ts must re-export formatBytes rather than define its own function
    const formatSource = fs.readFileSync("apps/web/lib/format.ts", "utf8");
    assert.ok(
      formatSource.includes('export { formatBytes } from "./formatBytes.ts";'),
      "format.ts must re-export formatBytes from formatBytes.ts"
    );
    assert.strictEqual(
      formatSource.includes("function formatBytes("),
      false,
      "format.ts must not define duplicate function formatBytes"
    );

    // ToolRunner must not define a local formatBytes function
    const toolRunnerSource = fs.readFileSync("apps/web/components/ToolRunner.tsx", "utf8");
    assert.strictEqual(
      toolRunnerSource.includes("function formatBytes("),
      false,
      "ToolRunner must not define local duplicate formatBytes"
    );

    // SplitTool must not define a local formatBytes function
    const splitToolSource = fs.readFileSync("apps/web/components/SplitTool.tsx", "utf8");
    assert.strictEqual(
      splitToolSource.includes("function formatBytes("),
      false,
      "SplitTool must not define local duplicate formatBytes"
    );
  });

  await t.test("formatBytes formats boundaries correctly and matches re-export", () => {
    assert.strictEqual(formatBytes(0), "0 B");
    assert.strictEqual(formatBytes(-10), "0 B");
    assert.strictEqual(formatBytes(500), "500 B");
    assert.strictEqual(formatBytes(1024), "1 KB");
    assert.strictEqual(formatBytes(1536), "1.5 KB");
    assert.strictEqual(formatBytes(1048576), "1 MB");
    assert.strictEqual(formatBytes(1073741824), "1 GB");

    // Re-export returns identical results
    assert.strictEqual(formatBytesReexport(1536), "1.5 KB");
  });
});

test("Duplicate CSS removal and inline styles consolidation (Issue #31)", async (t) => {
  await t.test(".alert-error is defined exactly once in globals.css as single source of truth", () => {
    const css = fs.readFileSync("apps/web/app/globals.css", "utf8");
    const matches = css.match(/^\.alert-error\s*\{/gm);
    assert.strictEqual(
      matches ? matches.length : 0,
      1,
      ".alert-error declaration block must appear exactly once in globals.css"
    );
  });

  await t.test("CSS ownership and architecture documentation exists", () => {
    assert.strictEqual(
      fs.existsSync("docs/CSS_OWNERSHIP.md"),
      true,
      "docs/CSS_OWNERSHIP.md must exist"
    );
    const doc = fs.readFileSync("docs/CSS_OWNERSHIP.md", "utf8");
    assert.ok(doc.includes("Ownership Layers"));
    assert.ok(doc.includes("Single Source of Truth"));
    assert.ok(doc.includes("Semantic Classes over Inline Styles"));
  });

  await t.test("Consolidated high-duplication components have zero or significantly reduced inline styles", () => {
    const checkInlineStyles = (filePath) => {
      const content = fs.readFileSync(filePath, "utf8");
      const matches = content.match(/style=\{\{/g);
      return matches ? matches.length : 0;
    };

    // ToolWorkspaceShell should have 0 inline styles
    assert.strictEqual(checkInlineStyles("apps/web/components/ToolWorkspaceShell.tsx"), 0);

    // ToolResultsView should have 0 inline styles
    assert.strictEqual(checkInlineStyles("apps/web/components/ToolResultsView.tsx"), 0);

    // MergeTool should have 0 inline styles
    assert.strictEqual(checkInlineStyles("apps/web/components/MergeTool.tsx"), 0);

    // RemoveTool should have <= 15 inline styles (reduced from 50)
    assert.ok(checkInlineStyles("apps/web/components/RemoveTool.tsx") <= 15);
  });
});

test("Derived navbar links and search debounce (Issue #33)", async (t) => {
  await t.test("navbar links are derived dynamically from registry manifests", () => {
    const links = deriveNavLinks();

    // First link is always All Tools
    assert.strictEqual(links[0].href, "/");
    assert.strictEqual(links[0].label, "All Tools");

    // Every active tool manifest must be present in navbar
    const activeManifests = manifests.filter((m) => !m.status || m.status === "active");
    assert.strictEqual(links.length, activeManifests.length + 1);

    for (const manifest of activeManifests) {
      const match = links.find((link) => link.href === `/tools/${manifest.id}`);
      assert.ok(match, `Expected tool "${manifest.id}" to have a navbar link`);
      assert.strictEqual(match.label, manifest.title);
    }

    // Specific check for Remove Pages which was previously missing
    const removeLink = links.find((l) => l.href === "/tools/remove");
    assert.ok(removeLink, "Navbar must include Remove Pages (/tools/remove)");
    assert.strictEqual(removeLink.label, "Remove Pages");
  });

  await t.test("Navbar component does not contain hardcoded tool link array literals", () => {
    const navbarContent = fs.readFileSync("apps/web/components/Navbar.tsx", "utf8");
    assert.strictEqual(
      navbarContent.includes('{ href: "/tools/merge"'),
      false,
      "Navbar.tsx must not contain hardcoded tool links"
    );
    assert.ok(
      navbarContent.includes("deriveNavLinks"),
      "Navbar.tsx must derive links using deriveNavLinks"
    );
  });

  await t.test("buildSearchTarget correctly determines route actions and query params", () => {
    // 1. On home page ("/"):
    // Searching sets or updates ?q=
    const homeSearch = buildSearchTarget("rotate", "/", new URLSearchParams());
    assert.strictEqual(homeSearch.action, "replace");
    assert.strictEqual(homeSearch.url, "/?q=rotate");

    // Whitespace is trimmed
    const trimmedSearch = buildSearchTarget("  split  ", "/", new URLSearchParams());
    assert.strictEqual(trimmedSearch.action, "replace");
    assert.strictEqual(trimmedSearch.url, "/?q=split");

    // Clearing search on home page removes ?q
    const clearHomeSearch = buildSearchTarget("", "/", new URLSearchParams("q=merge&foo=bar"));
    assert.strictEqual(clearHomeSearch.action, "replace");
    assert.strictEqual(clearHomeSearch.url, "/?foo=bar");

    // If query is unchanged, no action is taken
    const noOpHome = buildSearchTarget("merge", "/", new URLSearchParams("q=merge"));
    assert.strictEqual(noOpHome.action, "none");

    // 2. On subpages (e.g. "/tools/merge"):
    // Entering query pushes navigation to home with query
    const subpageSearch = buildSearchTarget("split", "/tools/merge", new URLSearchParams());
    assert.strictEqual(subpageSearch.action, "push");
    assert.strictEqual(subpageSearch.url, "/?q=split");

    // Empty query on subpage takes no action (avoids navigating away accidentally)
    const emptySubpage = buildSearchTarget("", "/tools/merge", new URLSearchParams());
    assert.strictEqual(emptySubpage.action, "none");
  });

  await t.test("debounce utility coalesces rapid calls, respects delay, cancel, and flush", async () => {
    let callCount = 0;
    let lastValue = "";

    const debouncedFn = debounce((val) => {
      callCount++;
      lastValue = val;
    }, 50);

    // Rapid successive invocations
    debouncedFn("a");
    debouncedFn("b");
    debouncedFn("c");

    // Should not have fired synchronously
    assert.strictEqual(callCount, 0);

    // Wait 25ms (less than 50ms)
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.strictEqual(callCount, 0);

    // Wait another 35ms (total 60ms > 50ms)
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.strictEqual(callCount, 1);
    assert.strictEqual(lastValue, "c");

    // Test cancel
    debouncedFn("d");
    debouncedFn.cancel();
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.strictEqual(callCount, 1, "Cancelled debounce must not fire");

    // Test flush
    debouncedFn("e");
    debouncedFn.flush();
    assert.strictEqual(callCount, 2);
    assert.strictEqual(lastValue, "e");
  });
});
