# Module specification

Every module is a package `packages/mod-<id>` that exports:
- `@pdfkit/mod-<id>/manifest`: light metadata (no heavy imports)
- `@pdfkit/mod-<id>` (default): a `ToolModule` with `run(inputs, opts, ctx)`

**Rules:** depend only on `@pdfkit/core` + one library; never import another module; `run` is pure (bytes in, bytes out); honor `ctx.signal` and report `ctx.onProgress`; ship its own tests and fixtures. Chaining happens only in `packages/pipelines`.
Add a module: `npm run new:module -- <id> "<Title>" <category>`, then register it in `apps/web/lib/registry.ts`.

| Phase | Module | Backend | Library | Depends on |
|---|---|---|---|---|
| 1 | merge, split, rotate (done) | client | @cantoo/pdf-lib | core |
| 1 | organize | client | pdf-lib + pdfjs-dist (thumbnails) | core, viewer |
| 1 | page-numbers, watermark, metadata, attachments, img-to-pdf | client | pdf-lib | core |
| 1 | edit (overlay), forms (create/fill/flatten) | client | pdf-lib (+pdfjs UI) | core, viewer |
| 2 | pdf-to-img | client | pdfjs-dist | core |
| 2 | compress | client | pdfjs-dist + pdf-lib (qpdf-wasm later) | core |
| 2 | compare | client | pdfjs-dist + pixelmatch | core |
| 2 | repair | client | pdf-lib tolerant load | core |
| 3 | protect, unlock | client | @cantoo/pdf-lib AES-256 | core |
| 3 | sign-visual | client | pdf-lib | core |
| 3 | sign-digital, verify-signature | hybrid | @signpdf (client) / pyHanko service | core, SignProvider |
| 4 | ocr-text, ocr-searchable-pdf | hybrid | Tesseract.js or ocr-svc (Unlimited-OCR) | core, OcrProvider |
| 4 | extract-tables, extract-formulas | server | Unlimited-OCR | core, OcrProvider |
| 5 | office-to-pdf, pdf-to-office | server | libreoffice-convert | core, ConvertProvider |
| 6 | pipelines/* | mixed | compositions | any modules |

Shared (non-tool) packages to add next: `packages/viewer` (pdfjs React viewer), `packages/providers` (Ocr/Convert/Sign interfaces + HTTP clients), `services/*` (Docker).
