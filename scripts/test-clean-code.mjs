import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { formatBytes } from "../apps/web/lib/formatBytes.ts";
import { deriveNavLinks, buildSearchTarget } from "../apps/web/lib/nav.ts";
import { debounce } from "../apps/web/lib/debounce.ts";
import { uint8ArrayToBlob } from "../apps/web/lib/blob.ts";
import { generateUUID } from "../apps/web/lib/uuid.ts";
import {
  formatBytes as formatBytesReexport,
  formatPageCount,
  clampMonotonicProgress,
} from "../apps/web/lib/format.ts";
import { resolveAssetUrl } from "../apps/web/lib/pdfjs.ts";
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

    // Every tool manifest must be present in navbar
    assert.strictEqual(links.length, manifests.length + 1);

    for (const manifest of manifests) {
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
      navbarContent.includes("deriveNavLinks") || navbarContent.includes("NAV_GROUPS"),
      "Navbar.tsx must derive links via deriveNavLinks or NAV_GROUPS (not hardcoded)"
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

test("Browser edge cases hardening (Issue #35)", async (t) => {
  await t.test("uint8ArrayToBlob preserves exact subarray view and byteOffset", async () => {
    // 1. Sliced subarray view
    const source = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
    const sliced = source.subarray(2, 6); // bytes [30, 40, 50, 60], byteOffset=2, length=4
    const blobFromSlice = uint8ArrayToBlob(sliced, "application/pdf");

    assert.strictEqual(blobFromSlice.size, 4, "Blob size must match subarray length, not buffer size");
    assert.strictEqual(blobFromSlice.type, "application/pdf");

    const arrayBuffer = await blobFromSlice.arrayBuffer();
    const resultBytes = Array.from(new Uint8Array(arrayBuffer));
    assert.deepStrictEqual(resultBytes, [30, 40, 50, 60], "Blob bytes must match exact subarray view");

    // 2. Full-buffer Uint8Array
    const full = new Uint8Array([1, 2, 3]);
    const blobFromFull = uint8ArrayToBlob(full, "application/pdf");
    assert.strictEqual(blobFromFull.size, 3);
    const fullBytes = Array.from(new Uint8Array(await blobFromFull.arrayBuffer()));
    assert.deepStrictEqual(fullBytes, [1, 2, 3]);

    // 3. Components no longer pass .buffer directly to new Blob
    const componentFiles = [
      "apps/web/components/ExtractTool.tsx",
      "apps/web/components/SplitTool.tsx",
      "apps/web/components/OrganizeTool.tsx",
      "apps/web/components/MergeTool.tsx",
      "apps/web/components/RemoveTool.tsx",
      "apps/web/components/RotateTool.tsx",
      "apps/web/components/ToolRunner.tsx",
    ];
    for (const f of componentFiles) {
      const code = fs.readFileSync(f, "utf8");
      assert.strictEqual(
        code.includes(".data.buffer"),
        false,
        `${f} must not pass .data.buffer directly to Blob`
      );
    }
  });

  await t.test("generateUUID generates valid RFC 4122 v4 UUIDs across environments with and without crypto.randomUUID", () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    // 1. Default environment (with crypto.randomUUID)
    const id1 = generateUUID();
    assert.ok(uuidRegex.test(id1), `id1 "${id1}" should match UUID v4 format`);

    const origRandomUUID = globalThis.crypto?.randomUUID;
    const origGetRandomValues = globalThis.crypto?.getRandomValues;

    try {
      // 2. Fallback: crypto.randomUUID missing -> falls back to crypto.getRandomValues
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: undefined,
        configurable: true,
        writable: true,
      });
      const id2 = generateUUID();
      assert.ok(uuidRegex.test(id2), `id2 "${id2}" from getRandomValues fallback should match UUID v4 format`);

      // 3. Fallback: both crypto.randomUUID and crypto.getRandomValues missing -> falls back to Math.random
      Object.defineProperty(globalThis.crypto, "getRandomValues", {
        value: undefined,
        configurable: true,
        writable: true,
      });
      const id3 = generateUUID();
      assert.ok(uuidRegex.test(id3), `id3 "${id3}" from Math.random fallback should match UUID v4 format`);
    } finally {
      if (origRandomUUID) {
        Object.defineProperty(globalThis.crypto, "randomUUID", {
          value: origRandomUUID,
          configurable: true,
          writable: true,
        });
      }
      if (origGetRandomValues) {
        Object.defineProperty(globalThis.crypto, "getRandomValues", {
          value: origGetRandomValues,
          configurable: true,
          writable: true,
        });
      }
    }

    // OrganizeTool does not call crypto.randomUUID directly
    const organizeCode = fs.readFileSync("apps/web/components/OrganizeTool.tsx", "utf8");
    assert.strictEqual(
      organizeCode.includes("crypto.randomUUID"),
      false,
      "OrganizeTool must not invoke crypto.randomUUID directly"
    );
  });

  await t.test("formatPageCount handles unknown and valid page counts properly", () => {
    // Unknown cases must never display as "1 page"
    assert.strictEqual(formatPageCount(null), "Unknown pages");
    assert.strictEqual(formatPageCount(undefined), "Unknown pages");
    assert.strictEqual(formatPageCount(Number.NaN), "Unknown pages");
    assert.strictEqual(formatPageCount(-1), "Unknown pages");

    // Known counts
    assert.strictEqual(formatPageCount(0), "0 pages");
    assert.strictEqual(formatPageCount(1), "1 page");
    assert.strictEqual(formatPageCount(2), "2 pages");
    assert.strictEqual(formatPageCount(100), "100 pages");
  });

  await t.test("clampMonotonicProgress ensures progress never decreases", () => {
    const assertClose = (actual, expected, message) => {
      assert.ok(Math.abs(actual - expected) < 1e-6, message || `Expected ${actual} to equal ${expected}`);
    };
    assertClose(clampMonotonicProgress(null, 0.1), 0.1);
    assertClose(clampMonotonicProgress(undefined, 0.2), 0.2);
    assertClose(clampMonotonicProgress(0.2, 0.5), 0.5);
    assertClose(clampMonotonicProgress(0.5, 0.3), 0.5, "Out of order smaller progress must be clamped");
    assertClose(clampMonotonicProgress(0.5, 0.5), 0.5);
    assertClose(clampMonotonicProgress(0.5, 0.9), 0.9);
    assertClose(clampMonotonicProgress(0.9, 1.0), 1.0);
  });

  await t.test("window.open uses noopener,noreferrer", () => {
    const toolRunnerCode = fs.readFileSync("apps/web/components/ToolRunner.tsx", "utf8");
    assert.ok(
      toolRunnerCode.includes('window.open(r.url, "_blank", "noopener,noreferrer")'),
      "ToolRunner window.open must specify noopener,noreferrer"
    );

    // Verify no unprotected window.open exists in web code
    const checkOpenCode = (filePath) => {
      const code = fs.readFileSync(filePath, "utf8");
      const matches = code.match(/window.open([^)]*)/g) || [];
      for (const m of matches) {
        assert.ok(m.includes("noopener,noreferrer"), `${filePath} window.open missing noopener,noreferrer: ${m}`);
      }
    };
    checkOpenCode("apps/web/components/ToolRunner.tsx");
  });

  await t.test("resolveAssetUrl handles root and subpath deployments correctly", () => {
    const origEnv = process.env.BASE_PATH;
    const origPublicEnv = process.env.NEXT_PUBLIC_BASE_PATH;

    try {
      delete process.env.BASE_PATH;
      delete process.env.NEXT_PUBLIC_BASE_PATH;

      // Root deployment
      assert.strictEqual(resolveAssetUrl("/vendor/pdf.min.mjs"), "/vendor/pdf.min.mjs");
      assert.strictEqual(resolveAssetUrl("vendor/pdf.worker.min.mjs"), "/vendor/pdf.worker.min.mjs");

      // Subpath deployment via BASE_PATH
      process.env.BASE_PATH = "/pdfkit";
      assert.strictEqual(resolveAssetUrl("/vendor/pdf.min.mjs"), "/pdfkit/vendor/pdf.min.mjs");

      // Subpath with trailing slash
      process.env.BASE_PATH = "/custom-path/";
      assert.strictEqual(resolveAssetUrl("/vendor/pdf.worker.min.mjs"), "/custom-path/vendor/pdf.worker.min.mjs");

      // NEXT_PUBLIC_BASE_PATH
      delete process.env.BASE_PATH;
      process.env.NEXT_PUBLIC_BASE_PATH = "/my-subpath";
      assert.strictEqual(resolveAssetUrl("/vendor/pdf.min.mjs"), "/my-subpath/vendor/pdf.min.mjs");
    } finally {
      process.env.BASE_PATH = origEnv;
      process.env.NEXT_PUBLIC_BASE_PATH = origPublicEnv;
    }

    // next.config.mjs supports subpath basePath
    const nextConfigCode = fs.readFileSync("apps/web/next.config.mjs", "utf8");
    assert.ok(nextConfigCode.includes("basePath"), "next.config.mjs must support dynamic basePath");
  });
});

test("Documentation & Module Scaffold Workflow (Issue #36)", async (t) => {
  await t.test("README.md documents all implemented tools and matches manifests", () => {
    const readme = fs.readFileSync("README.md", "utf8");
    for (const m of manifests) {
      assert.ok(
        readme.includes(`@pdfkit/mod-${m.id}`),
        `README.md must document package @pdfkit/mod-${m.id}`
      );
      assert.ok(
        readme.includes(m.title),
        `README.md must document tool title "${m.title}"`
      );
    }
    // Remove, Organize, and Extract specifically
    assert.ok(readme.includes("@pdfkit/mod-remove"), "README documents Remove Pages");
    assert.ok(readme.includes("@pdfkit/mod-organize"), "README documents Organize PDF");
    assert.ok(readme.includes("@pdfkit/mod-extract"), "README documents Extract Pages");

    // Organize is no longer listed in planned table
    const plannedSection = readme.slice(readme.indexOf("## Planned Modules"));
    assert.strictEqual(
      plannedSection.includes("`organize` | Organize Pages"),
      false,
      "organize must not be listed as a planned module in README"
    );
  });

  await t.test("docs/MODULES.md documents all implemented tools and contains no nonexistent packages", () => {
    const doc = fs.readFileSync("docs/MODULES.md", "utf8");
    for (const m of manifests) {
      assert.ok(
        doc.includes("`" + m.id + "`"),
        `docs/MODULES.md must document tool id "${m.id}"`
      );
    }

    // Must not reference phantom packages
    assert.strictEqual(doc.includes("packages/pipelines"), false, "No phantom packages/pipelines in MODULES.md");
    assert.strictEqual(doc.includes("packages/viewer"), false, "No phantom packages/viewer in MODULES.md");
    assert.strictEqual(doc.includes("packages/providers"), false, "No phantom packages/providers in MODULES.md");
  });

  await t.test("scripts/new-module.mjs produces a clean minimal template and does not copy mod-rotate", () => {
    const scaffoldCode = fs.readFileSync("scripts/new-module.mjs", "utf8");
    assert.strictEqual(
      scaffoldCode.includes('cpSync("packages/mod-rotate"'),
      false,
      "Scaffold must not copy mod-rotate wholesale"
    );
    assert.ok(scaffoldCode.includes("Contributor Checklist"), "Scaffold must output contributor checklist");
    assert.ok(scaffoldCode.includes("apps/web/lib/registry.ts"), "Checklist mentions registry");
    assert.ok(scaffoldCode.includes("next.config.mjs"), "Checklist mentions next.config");
    assert.ok(scaffoldCode.includes("toolComponents.tsx"), "Checklist mentions toolComponents / ToolRunner");
  });
});

test("Tool status feature completely removed from the project", async (t) => {
  await t.test("ToolManifest interface does not have status field and ToolStatus is removed", () => {
    const coreSource = fs.readFileSync("packages/core/src/index.ts", "utf8");
    assert.strictEqual(coreSource.includes("ToolStatus"), false, "ToolStatus must be removed from core");
    assert.strictEqual(coreSource.includes("status?:"), false, "status field must be removed from ToolManifest");
  });

  await t.test("No tool manifest defines a status property", () => {
    for (const m of manifests) {
      assert.strictEqual(m.status, undefined, `Tool "${m.id}" must not define a status property`);
    }
  });

  await t.test("Tool page does not render tool status badges (Ready/Planned)", () => {
    const pageSource = fs.readFileSync("apps/web/app/tools/[id]/page.tsx", "utf8");
    assert.strictEqual(pageSource.includes("tool-badge"), false, "tool-badge must not be rendered on tool page");
    assert.strictEqual(pageSource.includes("manifest.status"), false, "manifest.status must not be referenced");
    assert.strictEqual(pageSource.includes('"Ready"'), false, '"Ready" status label must not appear');
    assert.strictEqual(pageSource.includes('"Planned"'), false, '"Planned" status label must not appear');
  });
});
