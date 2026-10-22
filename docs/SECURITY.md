# Security Policy & Hardening

## Overview
This document outlines the security architecture and hardening measures implemented in PDFKit, particularly regarding client-side PDF rendering with PDF.js and host-level security headers.

## PDF.js Security Hardening (CVE-2024-4367 Remediation)

### 1. Upgrade to PDF.js >= 4.2.67
- PDFKit vendors `pdfjs-dist` (v4.10.38) locally in `apps/web/public/vendor/`.
- This resolves [CVE-2024-4367](https://github.com/advisories/GHSA-wgrm-67xf-hhpq) (arbitrary JavaScript execution during font rendering matrix evaluation).

### 2. Explicitly Disabling Eval
- All calls to `pdfjs.getDocument(...)` in `apps/web/lib/pdfjs.ts` explicitly set `isEvalSupported: false`.
- This prevents the PDF.js parser from using code evaluation when compiling fonts, glyphs, or PostScript calculators, eliminating code execution attack vectors from malicious PDFs.

### 3. Removal of Unverified Remote CDN Fallbacks
- All PDF.js assets (`pdf.min.mjs`, `pdf.worker.min.mjs`, etc.) are strictly self-hosted from the same origin under `/vendor/`.
- External, unverified CDN fallbacks (e.g. `cdnjs.cloudflare.com`) have been completely removed, preventing supply-chain script injection and untrusted remote code execution.

### 4. Robust Loader with Failure Retry
- `apps/web/lib/pdfjs.ts` catches loader rejections and resets cached initialization promises.
- If a transient network glitch or asset load failure occurs, subsequent PDF preview attempts automatically retry without requiring a full browser page reload.

## Content Security Policy (CSP) & Security Headers

### Enforced CSP Directives
```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';
```

- **`script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`**: Disallows `'unsafe-eval'`, ensuring any eval attempt by malicious PDF streams is blocked by browser CSP.
- **`object-src 'none'`**: Disallows embedding Flash, Java, or legacy active content.
- **`worker-src 'self' blob:`**: Restricts web worker scripts to local scripts and local Blob URLs.
- **`connect-src 'self' blob:`**: Prevents unauthorized data exfiltration or external script retrieval.
- **`frame-ancestors 'none'`**: Protects against clickjacking.

### Hosting Layer Enforcement
Headers are enforced across supported deployment platforms:
1. **Local Static Server (`serve`)**: Configured via `apps/web/public/serve.json`.
2. **Cloudflare Pages / Netlify**: Configured via `apps/web/public/_headers`.
3. **Vercel**: Configured via `apps/web/vercel.json`.
4. **HTML Meta Tag**: Embedded in `<head>` in `apps/web/app/layout.tsx` for universal browser enforcement on static exports.
