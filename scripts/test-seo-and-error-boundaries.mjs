import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { manifests } from "../apps/web/lib/registry.ts";
import sitemapFn from "../apps/web/app/sitemap.ts";
import robotsFn from "../apps/web/app/robots.ts";
import { getToolMetadataById } from "../apps/web/lib/toolMetadata.ts";

test("SEO, Metadata, Sitemap, Robots, and Error Boundaries (Issue #32)", async (t) => {
  await t.test("error.tsx and global-error.tsx error boundaries exist and export components", () => {
    assert.strictEqual(fs.existsSync("apps/web/app/error.tsx"), true, "apps/web/app/error.tsx must exist");
    assert.strictEqual(fs.existsSync("apps/web/app/global-error.tsx"), true, "apps/web/app/global-error.tsx must exist");

    const errorContent = fs.readFileSync("apps/web/app/error.tsx", "utf8");
    assert.ok(errorContent.includes('"use client"'), "error.tsx must be a client component");
    assert.ok(errorContent.includes("reset"), "error.tsx must accept reset callback");
    assert.ok(errorContent.includes("Try Again"), "error.tsx must render Try Again button");
    assert.ok(errorContent.includes("Return Home"), "error.tsx must render Return Home link");

    const globalErrorContent = fs.readFileSync("apps/web/app/global-error.tsx", "utf8");
    assert.ok(globalErrorContent.includes('"use client"'), "global-error.tsx must be a client component");
    assert.ok(globalErrorContent.includes("<html"), "global-error.tsx must render <html>");
    assert.ok(globalErrorContent.includes("<body"), "global-error.tsx must render <body>");
    assert.ok(globalErrorContent.includes("reset"), "global-error.tsx must accept reset callback");
  });

  await t.test("sitemap.ts dynamically generates all tool routes from the registry", () => {
    const sitemapEntries = sitemapFn();
    assert.ok(Array.isArray(sitemapEntries), "sitemap must return array of entries");
    assert.strictEqual(sitemapEntries.length, manifests.length + 1);

    const urls = new Set(sitemapEntries.map((e) => e.url));
    assert.ok(urls.has("https://pdfkit.org"), "sitemap must contain root URL");

    for (const m of manifests) {
      assert.ok(urls.has(`https://pdfkit.org/tools/${m.id}`), `sitemap missing tool /tools/${m.id}`);
    }
  });

  await t.test("robots.ts allows crawling and links to sitemap.xml", () => {
    const robotsConfig = robotsFn();
    assert.strictEqual(robotsConfig.rules?.userAgent, "*");
    assert.strictEqual(robotsConfig.rules?.allow, "/");
    assert.strictEqual(robotsConfig.sitemap, "https://pdfkit.org/sitemap.xml");
  });

  await t.test("tool page exports generateMetadata and produces unique, rich metadata per tool manifest", () => {
    const pageSource = fs.readFileSync("apps/web/app/tools/[id]/page.tsx", "utf8");
    assert.ok(pageSource.includes("export async function generateMetadata"), "page.tsx must export generateMetadata");

    const titles = new Set();
    const descriptions = new Set();

    for (const m of manifests) {
      const meta = getToolMetadataById(m.id);
      assert.strictEqual(meta.title, m.title);
      assert.strictEqual(meta.description, m.description);
      assert.strictEqual(meta.openGraph?.description, m.description);

      titles.add(meta.title);
      descriptions.add(meta.description);
    }

    assert.strictEqual(titles.size, manifests.length, "Each tool must have a unique title");
    assert.strictEqual(descriptions.size, manifests.length, "Each tool must have a unique description");

    // Non-existent tool returns fallback metadata
    const notFoundMeta = getToolMetadataById("unknown-tool");
    assert.strictEqual(notFoundMeta.title, "Tool Not Found | PDFKit");
  });

  await t.test("build artifacts output/sitemap.xml and output/robots.txt exist when built", () => {
    if (fs.existsSync("apps/web/out")) {
      assert.strictEqual(fs.existsSync("apps/web/out/sitemap.xml"), true, "out/sitemap.xml must exist");
      assert.strictEqual(fs.existsSync("apps/web/out/robots.txt"), true, "out/robots.txt must exist");

      const sitemapXml = fs.readFileSync("apps/web/out/sitemap.xml", "utf8");
      assert.ok(sitemapXml.includes("<urlset"), "sitemap.xml must contain urlset");
      assert.ok(sitemapXml.includes("/tools/merge"), "sitemap.xml must include /tools/merge");

      const robotsTxt = fs.readFileSync("apps/web/out/robots.txt", "utf8");
      assert.ok(robotsTxt.includes("User-Agent: *"), "robots.txt must have User-Agent");
      assert.ok(robotsTxt.includes("Sitemap: https://pdfkit.org/sitemap.xml"), "robots.txt must declare sitemap");
    }
  });
});
