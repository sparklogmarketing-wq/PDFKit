# PDFKit

Client-side PDF tools. Next.js (static export) + npm workspaces. No server needed at runtime.

## Getting Started

```bash
npm install          # installs all workspaces from the repo root
npm run dev          # http://localhost:3000
npm run build        # static site in apps/web/out
npm run start        # serve the built site
npm run typecheck    # type-check all workspaces
npm run lint         # lint all packages with ESLint
npm test             # run unit and regression test suites
npm run new:module -- <id> "<Title>" <category>   # scaffold a new module
```

Requires Node 22.6+ (required for native TypeScript strip-types execution).

---

## Packages

### `@pdfkit/core` — `packages/core`

Shared types and utilities. Every module depends only on this package.

| Export | Description |
|---|---|
| `ToolManifest` | Metadata interface (id, title, category, fields, related, …) |
| `ToolModule<O>` | Contract: `run(inputs, opts, ctx) → OutputFile[]` |
| `FieldDef` | Union type for form field definitions (text, number, select, checkbox) |
| `OutputFile` | `{ name, mime, data: Uint8Array }` |
| `RunContext` | `{ signal: AbortSignal, onProgress(fraction) }` |
| `ToolError` | Typed error class for user-facing failures |
| `parsePageSpec(spec, total)` | Parses range strings like `"1-3,5,8-"` into zero-based page indices |
| `checkAborted(signal)` | Throws `ToolError("Cancelled")` if the abort signal has fired |

---

## Implemented Modules

Each module lives in `packages/mod-<id>` and exposes two entry points:

- `@pdfkit/mod-<id>` — default export: the `ToolModule` with a `run()` function
- `@pdfkit/mod-<id>/manifest` — named export `manifest`: lightweight metadata, no heavy imports

---

### `@pdfkit/mod-merge` — `packages/mod-merge`

**Merge PDF** · category: `organize` · backend: `client`

Combines several PDFs into one, in the order you choose.

| Detail | Value |
|---|---|
| Package | `@pdfkit/mod-merge` |
| Accepts | `application/pdf` (multiple files) |
| Options | none |
| Output | `merged.pdf` (or custom name) |
| Library | `@cantoo/pdf-lib` |
| Depends on | `@pdfkit/core` |

**Build / run independently:**

```bash
npx tsc --noEmit -p packages/mod-merge/tsconfig.json
node --experimental-strip-types scripts/test-modules.mjs
```

---

### `@pdfkit/mod-split` — `packages/mod-split`

**Split PDF** · category: `organize` · backend: `client`

Cuts a PDF into several files by page ranges, every N pages, or target byte size.

| Detail | Value |
|---|---|
| Package | `@pdfkit/mod-split` |
| Accepts | `application/pdf` (single file) |
| Options | `mode` (`ranges` \| `every` \| `size`), `ranges` (e.g. `"1-3,4-"`), `n` (pages per chunk), `maxSizeBytes` (default: 500,000 bytes / `DEFAULT_MAX_SIZE_BYTES`), `allowCompression` (boolean), `mergeAll` (boolean) |
| Output | `<name>-part1.pdf`, `<name>-part2.pdf`, … or `<name>-merged.pdf` |
| Library | `@cantoo/pdf-lib` |
| Depends on | `@pdfkit/core` |

> **Size mode & mergeAll constraints:** In `mode: "size"`, `maxSizeBytes` defaults to 500,000 bytes (shared between manifest and module). Individual pages that exceed `maxSizeBytes` are rejected with a `ToolError`. If `mergeAll: true` is requested alongside `mode: "size"`, the operation will throw a `ToolError` if merging the parts causes the resulting file to exceed `maxSizeBytes`.

**Page range syntax** (shared across tools via `parsePageSpec`):

| Spec | Meaning |
|---|---|
| `1` | Page 1 only |
| `1,3,5` | Pages 1, 3, 5 |
| `2-4` | Pages 2 through 4 |
| `3-` | Page 3 to last |
| `-2` | First page to page 2 |
| *(blank)* | All pages |

**Build / run independently:**

```bash
npx tsc --noEmit -p packages/mod-split/tsconfig.json
node --experimental-strip-types scripts/test-modules.mjs
```

---

### `@pdfkit/mod-rotate` — `packages/mod-rotate`

**Rotate PDF** · category: `organize` · backend: `client`

Rotates all pages or a subset of pages by a given angle (90°, 180°, or 270°).

| Detail | Value |
|---|---|
| Package | `@pdfkit/mod-rotate` |
| Accepts | `application/pdf` (single file or multiple via UI) |
| Options | `degrees` (`0` \| `90` \| `180` \| `270`), `pages` (page range string, blank = all), `fileRotations` (per-file page maps) |
| Output | `<name>-rotated.pdf` |
| Library | `@cantoo/pdf-lib` |
| Depends on | `@pdfkit/core` |

**Build / run independently:**

```bash
npx tsc --noEmit -p packages/mod-rotate/tsconfig.json
node --experimental-strip-types scripts/test-modules.mjs
```

---

### `@pdfkit/mod-remove` — `packages/mod-remove`

**Remove Pages** · category: `organize` · backend: `client`

Removes specific pages from a PDF document by 0-based page index.

| Detail | Value |
|---|---|
| Package | `@pdfkit/mod-remove` |
| Accepts | `application/pdf` (single file) |
| Options | `pageIndices` (array of zero-based numbers), `outputFileName` (optional string) |
| Output | `<name>_removed.pdf` |
| Library | `@cantoo/pdf-lib` |
| Depends on | `@pdfkit/core` |

**Build / run independently:**

```bash
npx tsc --noEmit -p packages/mod-remove/tsconfig.json
node --experimental-strip-types scripts/test-modules.mjs
```

---

### `@pdfkit/mod-organize` — `packages/mod-organize`

**Organize PDF** · category: `organize` · backend: `client`

Reorder, sort, delete, interleave pages, and insert blank pages across one or more documents.

| Detail | Value |
|---|---|
| Package | `@pdfkit/mod-organize` |
| Accepts | `application/pdf` (multiple files) |
| Options | `pages` (array of `OrganizePageItem`), `outputName` (optional string) |
| Output | `<name>_organized.pdf` |
| Library | `@cantoo/pdf-lib` |
| Depends on | `@pdfkit/core` |

**Build / run independently:**

```bash
npx tsc --noEmit -p packages/mod-organize/tsconfig.json
node --experimental-strip-types scripts/test-modules.mjs
```

---

### `@pdfkit/mod-extract` — `packages/mod-extract`

**Extract Pages** · category: `organize` · backend: `client`

Extracts selected pages or all pages into individual files or a single merged PDF.

| Detail | Value |
|---|---|
| Package | `@pdfkit/mod-extract` |
| Accepts | `application/pdf` (single file) |
| Options | `pages` (zero-based number array, blank = all), `mergeAll` (boolean), `outputName` (optional string) |
| Output | `<name>-page<N>.pdf` or `<name>_extracted.pdf` |
| Library | `@cantoo/pdf-lib` |
| Depends on | `@pdfkit/core` |

**Build / run independently:**

```bash
npx tsc --noEmit -p packages/mod-extract/tsconfig.json
node --experimental-strip-types scripts/test-modules.mjs
```

### `@pdfkit/mod-word-to-pdf` --- `packages/mod-word-to-pdf`

**Word to PDF** � category: `convert` � backend: `client`

Converts Word documents (`.docx`, `.doc`) and existing PDFs into PDF files, entirely in the browser. Supports per-file rotation, multi-file conversion, and optional merge-all mode. The DOCX parser is built with `jszip` and renders paragraphs using `@cantoo/pdf-lib` Helvetica fonts. For `.doc` or unrecognised formats, readable text is extracted from the raw binary as a fallback.

| Detail | Value |
|---|---|
| Package | `@pdfkit/mod-word-to-pdf` |
| Accepts | `.docx`, `.doc`, `.pdf` (multiple files) |
| Options | `degrees` (global rotation: 0/90/180/270), `rotations` (per-file rotation map), `mergeAll` (boolean), `outputName` (string), `pageSize` ("a4" or "letter") |
| Output | `<name>.pdf` per file, or `converted.pdf` (when `mergeAll: true`) |
| Library | `@cantoo/pdf-lib` + `jszip` |
| Depends on | `@pdfkit/core` |

**Build / run independently:**

```bash
npx tsc --noEmit -p packages/mod-word-to-pdf/tsconfig.json
node --experimental-strip-types scripts/test-modules.mjs
```

---

## Planned Modules (Client-Side)

All modules below run entirely in the browser via Web Workers — **zero server involvement**. The client-side library stack is:

| Library | Runs In | Role |
|---|---|---|
| `@cantoo/pdf-lib` | Browser | PDF manipulation (create, edit, annotate, encrypt) |
| `pdfjs-dist` | Browser (WASM) | PDF rendering — rasterise pages to canvas / ImageData |
| `tesseract.js` | Browser (WASM) | OCR — extract text from images |
| `pixelmatch` | Browser | Pixel-level image diffing |

---

### Category: `organize`

| Module id | Title | Library | Key API | Inputs → Output |
|---|---|---|---|---|
| `page-numbers` | Add Page Numbers | `@cantoo/pdf-lib` | `page.drawText()` in loop | 1 PDF → numbered PDF |
| `watermark` | Add Watermark | `@cantoo/pdf-lib` | `drawText()` / `drawImage()` per page | 1 PDF + optional image → watermarked PDF |

---

### Category: `edit`

| Module id | Title | Library | Key API | Inputs → Output |
|---|---|---|---|---|
| `edit` | Edit PDF (overlay) | `@cantoo/pdf-lib` | `drawText()`, `drawImage()`, `drawSvgPath()` | 1 PDF → edited PDF |
| `forms-fill` | Fill Form | `@cantoo/pdf-lib` | `getForm()`, `getTextField()`, `setText()` | 1 PDF → filled PDF |
| `forms-create` | Create Form | `@cantoo/pdf-lib` | `createTextField()`, `createCheckBox()`, etc. | 1 PDF → PDF with form fields |
| `forms-flatten` | Flatten Form | `@cantoo/pdf-lib` | `getForm().flatten()` | 1 PDF → flat (non-editable) PDF |
| `metadata` | Edit Metadata | `@cantoo/pdf-lib` | `setTitle()`, `setAuthor()`, `setKeywords()` | 1 PDF → PDF with updated metadata |
| `attachments` | Add Attachments | `@cantoo/pdf-lib` | `embedFile()` | 1 PDF + files → PDF with embedded files |

---

### Category: `convert`

| Module id | Title | Library | Key API | Inputs → Output |
|---|---|---|---|---|
| `img-to-pdf` | Image → PDF | `@cantoo/pdf-lib` | `embedJpg()` / `embedPng()` + `drawImage()` | JPG/PNG(s) → PDF |
| `pdf-to-img` | PDF → Images | `pdfjs-dist` | `getPage()` → `render()` to OffscreenCanvas → `toBlob()` | 1 PDF → PNG per page |

---

### Category: `security`

| Module id | Title | Library | Key API | Notes |
|---|---|---|---|---|
| `protect` | Protect PDF | `@cantoo/pdf-lib` | `encrypt({ userPassword, ownerPassword, … })` | AES-256; requires the `@cantoo` fork (not vanilla `pdf-lib`) |
| `unlock` | Unlock PDF | `@cantoo/pdf-lib` | Load with password, save without encryption | Same fork required |
| `sign-visual` | Add Signature Image | `@cantoo/pdf-lib` | `embedPng()` + `drawImage()` per page | Visual stamp only, not a cryptographic signature |

---

### Category: `ocr`

| Module id | Title | Library | Key API | Notes |
|---|---|---|---|---|
| `ocr-text` | Extract Text (OCR) | `tesseract.js` | `createWorker()` → `recognize(imageData)` | Runs WASM in a Web Worker; no GPU needed |
| `ocr-searchable` | Make Searchable PDF | `pdfjs-dist` + `tesseract.js` + `@cantoo/pdf-lib` | Rasterise → OCR → embed invisible text layer | Three-step pipeline, all client-side |

---

### Category: `utility`

| Module id | Title | Library | Key API | Notes |
|---|---|---|---|---|
| `compress` | Compress PDF | `pdfjs-dist` + `@cantoo/pdf-lib` | Re-render pages at target DPI → rebuild PDF | Reduces image resolution; no binary compression |
| `compare` | Compare PDFs | `pdfjs-dist` + `pixelmatch` | Render both → diff pixels → highlight | Outputs annotated diff image per page |
| `repair` | Repair PDF | `@cantoo/pdf-lib` | Load with `{ ignoreEncryption: true, throwOnInvalidObject: false }` | Best-effort recovery; no true repair engine in pure JS |

---

## Modules That Require a Server

The following features **cannot** run client-side. They are noted here for completeness but are out of scope unless a backend service is added.

| Feature | Reason | Server-Side Option |
|---|---|---|
| Word / Excel / PowerPoint → PDF | Requires LibreOffice binary | `libreoffice-convert` on Node.js server |
| PDF → Word / Excel / PowerPoint | Same | `libreoffice-convert` |
| HTML / CSV / EPUB → PDF | Same | `libreoffice-convert` |
| True digital signatures (PKCS#7) | Needs private key operations + cert chain | `@signpdf` on server or pyHanko |
| High-quality OCR (multi-language, tables, formulas) | Large GPU model | `baidu/Unlimited-OCR` (Python, CUDA) |

---

## Adding a New Module

```bash
npm run new:module -- <id> "<Title>" <category>
# e.g.: npm run new:module -- watermark "Add Watermark" edit
```

This creates a clean, minimal package template in `packages/mod-<id>` with typed entry points and manifest.

### Contributor Integration Checklist:

1. **Workspace Dependencies:**
   - In [`apps/web/package.json`](apps/web/package.json), add `"@pdfkit/mod-<id>": "*"` to `dependencies`.
   - In [`apps/web/next.config.mjs`](apps/web/next.config.mjs), add `"@pdfkit/mod-<id>"` to `transpilePackages`.

2. **Registry Wiring:**
   - In [`apps/web/lib/registry.ts`](apps/web/lib/registry.ts):
     ```ts
     import { manifest as myTool } from "@pdfkit/mod-<id>/manifest";
     export const manifests: ToolManifest[] = [..., myTool];
     export const loaders = {
       ...
       [myTool.id]: () => import("@pdfkit/mod-<id>"),
     };
     ```

3. **Navigation & Routes:**
   - Navigation links in [`apps/web/components/Navbar.tsx`](apps/web/components/Navbar.tsx) automatically derive all active tools from `registry.ts`.
   - The route `/tools/<id>` resolves automatically.

4. **Tool UI:**
   - Unmapped tools render the generic `ToolRunner` component automatically using field definitions from `manifest.ts`.
   - For custom interactive workflows (such as canvas manipulation, reordering, or zoom preview), register a dedicated component in [`apps/web/lib/toolComponents.tsx`](apps/web/lib/toolComponents.tsx).

5. **Testing:**
   - Add unit tests for the module's execution and error handling in [`scripts/test-modules.mjs`](scripts/test-modules.mjs).
   - Validate with `npm run typecheck && npm test`.

6. **Documentation:**
   - Add the tool and its options to [`README.md`](README.md) and [`docs/MODULES.md`](docs/MODULES.md).

---

Module contract rules: [`docs/MODULES.md`](docs/MODULES.md)
