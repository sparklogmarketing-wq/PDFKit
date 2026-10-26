import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { formatBytes } from "../apps/web/lib/formatBytes.ts";
import { formatBytes as formatBytesReexport } from "../apps/web/lib/format.ts";

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
