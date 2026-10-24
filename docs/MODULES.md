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

## Module Specific Notes

### Split Module (`packages/mod-split`)
- **Default Size**: `DEFAULT_MAX_SIZE_BYTES = 500000` (500 KB) is shared identically across both `manifest.ts` and module execution (`index.ts`).
- **Single Page Limit**: When splitting by size, any individual page whose serialized size exceeds `maxSizeBytes` throws a descriptive `ToolError`.
- **`mergeAll` Invariant**: When `opts.mergeAll: true` is combined with `mode: "size"`, `mergeAll` is validated to ensure it cannot silently exceed the requested `maxSizeBytes`. If merging the parts into a single document produces or requires a file size greater than `maxSizeBytes`, a validation `ToolError` is thrown.

### Organize Module (`packages/mod-organize`)
- **Blank Page Dimension & Orientation Inheritance**: Blank pages inserted into a document inherit their width, height, and orientation from neighboring pages (or the document) rather than defaulting to hardcoded A4 portrait. Explicit `width` and `height` properties can also be specified on `OrganizePageItem`.
- **Blank Page Rotation**: Rotation angle (`0, 90, 180, 270`) on blank items is fully preserved and applied to the generated PDF page and UI canvas.
- **Relative Position Preservation**: Reordering files, sorting (A-Z, Z-A, 1-9, 9-1), interleaving, or removing files/pages preserves inserted blank pages at their relative positions (start, middle, end) via `reinsertBlanksAtRelativePositions`.

