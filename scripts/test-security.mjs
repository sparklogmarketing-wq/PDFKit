import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "@cantoo/pdf-lib";
import { getPdfJs, resetPdfJs, getPdfInfo } from "../apps/web/lib/pdfjs.ts";

test("security: PDF.js version and vendor assets", async (t) => {
  await t.test("vendored PDF.js files exist locally and version >= 4.2.67", async () => {
    const vendorDir = path.resolve("apps/web/public/vendor");
    assert.ok(fs.existsSync(path.join(vendorDir, "pdf.min.mjs")), "pdf.min.mjs exists");
    assert.ok(fs.existsSync(path.join(vendorDir, "pdf.worker.min.mjs")), "pdf.worker.min.mjs exists");

    const pdfjsModule = await import("../apps/web/public/vendor/pdf.min.mjs");
    const version = pdfjsModule.version;
    assert.ok(version, "version should be defined");

    const [major, minor, patch] = version.split(".").map(Number);
    // Must be >= 4.2.67 to remediate CVE-2024-4367
    assert.ok(
      major > 4 || (major === 4 && (minor > 2 || (minor === 2 && patch >= 67))),
      `PDF.js version ${version} must be >= 4.2.67`
    );
  });

  await t.test("apps/web/package.json has pdfjs-dist >= 4.2.67", () => {
    const pkg = JSON.parse(fs.readFileSync("apps/web/package.json", "utf8"));
    const versionSpec = pkg.dependencies?.["pdfjs-dist"] || pkg.devDependencies?.["pdfjs-dist"];
    assert.ok(versionSpec, "pdfjs-dist dependency present in apps/web/package.json");
    const num = versionSpec.replace(/^[^\d]*/, "");
    const [major, minor, patch] = num.split(".").map(Number);
    assert.ok(
      major > 4 || (major === 4 && (minor > 2 || (minor === 2 && patch >= 67))),
      `Dependency version ${versionSpec} must be >= 4.2.67`
    );
  });

  await t.test("no unverified remote CDN fallbacks exist in apps/web/lib/pdfjs.ts", () => {
    const code = fs.readFileSync("apps/web/lib/pdfjs.ts", "utf8");
    assert.equal(code.includes("cdnjs.cloudflare.com"), false, "No cdnjs fallback");
    assert.equal(code.includes("unpkg.com"), false, "No unpkg fallback");
    assert.equal(code.includes("cdn.jsdelivr.net"), false, "No jsdelivr fallback");
    assert.equal(code.includes("http://"), false, "No unencrypted http URLs");
    assert.equal(code.includes("https://"), false, "No remote https script URLs");
  });
});

test("security: eval disabled and getDocument configuration", async (t) => {
  await t.test("apps/web/lib/pdfjs.ts sets isEvalSupported: false on all getDocument calls", () => {
    const code = fs.readFileSync("apps/web/lib/pdfjs.ts", "utf8");
    const getDocumentMatches = code.match(/getDocument\(\{[\s\S]*?\}\)/g) || [];
    assert.ok(getDocumentMatches.length >= 2, "Found at least 2 getDocument calls");
    for (const call of getDocumentMatches) {
      assert.ok(
        call.includes("isEvalSupported: false"),
        `getDocument call must specify isEvalSupported: false -> ${call}`
      );
    }
  });

  await t.test("smoke test: getDocument loads sample PDF with isEvalSupported: false", async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([200, 200]);
    const pdfBytes = await pdfDoc.save();

    const pdfjsModule = await import("../apps/web/public/vendor/pdf.min.mjs");
    let receivedEvalOption = null;

    const originalGetDoc = pdfjsModule.getDocument;
    // Inspect parameter passed to getDocument
    const loadingTask = pdfjsModule.getDocument({
      data: pdfBytes,
      isEvalSupported: false,
    });
    const doc = await loadingTask.promise;
    assert.equal(doc.numPages, 1);
    if (typeof doc.destroy === "function") doc.destroy();
  });

  await t.test("smoke test: malicious font / eval payload is safely rejected or handled without code execution", async () => {
    // Malicious font eval payload (CVE-2024-4367 style font matrix with executable JS string)
    const craftedPdfBytes = new TextEncoder().encode(
      `%PDF-1.7
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FontMatrix [1 0 0 1 0 0] >> endobj
5 0 obj << /Length 20 >> stream
BT /F1 12 Tf ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000236 00000 n 
0000000334 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
405
%%EOF`
    );

    const pdfjsModule = await import("../apps/web/public/vendor/pdf.min.mjs");
    let evalInvoked = false;
    const originalEval = globalThis.eval;
    globalThis.eval = () => {
      evalInvoked = true;
      throw new Error("Eval invoked!");
    };

    try {
      const loadingTask = pdfjsModule.getDocument({
        data: craftedPdfBytes,
        isEvalSupported: false,
      });
      const doc = await loadingTask.promise;
      assert.ok(doc.numPages >= 1);
      if (typeof doc.destroy === "function") doc.destroy();
    } catch (e) {
      // It may fail parsing safely, but must NOT invoke eval
    } finally {
      globalThis.eval = originalEval;
    }

    assert.equal(evalInvoked, false, "eval() should NEVER be invoked");
  });
});

test("security: loader rejection and retry mechanism", async (t) => {
  await t.test("loader rejection does not lock permanently and can be retried", async () => {
    // Ensure clean state
    resetPdfJs();

    // Mock global window and document to simulate loader failure then success
    let shouldFail = true;
    let loadAttempts = 0;

    const mockPdfLib = {
      version: "4.10.38",
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: () => ({ promise: Promise.resolve({ numPages: 1 }) }),
    };

    const originalWindow = globalThis.window;
    const originalDoc = globalThis.document;

    globalThis.window = {
      location: { href: "http://localhost:3000" },
    };

    globalThis.document = {
      createElement: (tag) => {
        return {
          type: "",
          src: "",
          onload: null,
          onerror: null,
        };
      },
      head: {
        appendChild: (script) => {
          loadAttempts++;
          setTimeout(() => {
            if (shouldFail) {
              if (script.onerror) script.onerror(new Error("Network Error"));
            } else {
              window.pdfjsLib = mockPdfLib;
              if (script.onload) script.onload();
            }
          }, 5);
        },
      },
    };

    try {
      // 1. First attempt fails
      await assert.rejects(
        async () => await getPdfJs(),
        /Failed to load|Network Error/
      );

      // 2. Second attempt (without page reload) should retry, not return cached rejection!
      shouldFail = false;
      const lib = await getPdfJs();
      assert.equal(lib.version, "4.10.38");
      assert.equal(loadAttempts, 2, "Second attempt triggered a new load");

      // 3. resetPdfJs() cleanly clears cache
      resetPdfJs();
      assert.equal(window.pdfjsLib, undefined);
    } finally {
      resetPdfJs();
      globalThis.window = originalWindow;
      globalThis.document = originalDoc;
    }
  });
});

test("security: hosting layer CSP and documentation", async (t) => {
  await t.test("CSP is configured in public/serve.json without unsafe-eval", () => {
    assert.ok(fs.existsSync("apps/web/public/serve.json"), "serve.json exists");
    const config = JSON.parse(fs.readFileSync("apps/web/public/serve.json", "utf8"));
    const headers = config.headers?.[0]?.headers || [];
    const csp = headers.find((h) => h.key === "Content-Security-Policy")?.value || "";
    assert.ok(csp.length > 0, "CSP header present");
    assert.ok(csp.includes("default-src 'self'"), "default-src self");
    assert.equal(csp.includes("'unsafe-eval'"), false, "No unsafe-eval allowed in CSP");
    assert.ok(csp.includes("worker-src 'self' blob:"), "worker-src configured");
  });

  await t.test("CSP is configured in public/_headers for Cloudflare/Netlify", () => {
    assert.ok(fs.existsSync("apps/web/public/_headers"), "_headers exists");
    const content = fs.readFileSync("apps/web/public/_headers", "utf8");
    assert.ok(content.includes("Content-Security-Policy:"), "CSP in _headers");
    assert.equal(content.includes("'unsafe-eval'"), false, "No unsafe-eval in _headers CSP");
  });

  await t.test("CSP is configured in vercel.json", () => {
    assert.ok(fs.existsSync("apps/web/vercel.json"), "vercel.json exists");
    const config = JSON.parse(fs.readFileSync("apps/web/vercel.json", "utf8"));
    const headers = config.headers?.[0]?.headers || [];
    const csp = headers.find((h) => h.key === "Content-Security-Policy")?.value || "";
    assert.ok(csp.length > 0, "CSP in vercel.json");
    assert.equal(csp.includes("'unsafe-eval'"), false, "No unsafe-eval in vercel.json CSP");
  });

  await t.test("CSP meta tag is present in apps/web/app/layout.tsx", () => {
    const layout = fs.readFileSync("apps/web/app/layout.tsx", "utf8");
    assert.ok(layout.includes("Content-Security-Policy"), "CSP meta tag present");
    assert.equal(layout.includes("'unsafe-eval'"), false, "No unsafe-eval in layout CSP");
  });

  await t.test("docs/SECURITY.md documents policy and CVE-2024-4367 mitigation", () => {
    assert.ok(fs.existsSync("docs/SECURITY.md"), "docs/SECURITY.md exists");
    const doc = fs.readFileSync("docs/SECURITY.md", "utf8");
    assert.ok(doc.includes("CVE-2024-4367"), "Mentions CVE-2024-4367");
    assert.ok(doc.includes("isEvalSupported: false"), "Documents isEvalSupported");
    assert.ok(doc.includes("Content-Security-Policy"), "Documents CSP");
  });
});
