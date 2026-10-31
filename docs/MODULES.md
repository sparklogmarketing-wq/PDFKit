# Module specification

Every module is a package `packages/mod-<id>` that exports:
- `@pdfkit/mod-<id>/manifest`: light metadata (id, title, category, fields, related)
- `@pdfkit/mod-<id>` (default): a `ToolModule` with `run(inputs, opts, ctx)`

**Rules:**
- Depend only on `@pdfkit/core` and relevant manipulation libraries (e.g. `@cantoo/pdf-lib`).
- Modules are decoupled: never import another module directly.
- `run()` is pure: bytes in (`InputFile[]`), options in (`opts`), and bytes out (`OutputFile[]`).
- Honor cancellation: call `checkAborted(ctx?.signal)` before and during expensive processing.
- Report progress: update `ctx?.onProgress?.(fraction)` monotonically (0.0 to 1.0).
- Validate upfront: reject oversized inputs, invalid ranges, or out-of-bound indices with descriptive `ToolError` instances.
- Provide comprehensive test coverage in `scripts/test-modules.mjs`.

## Active & Implemented Modules

| Module ID | Title | Category | Backend | Library | Depends On | Status |
|---|---|---|---|---|---|---|
| `merge` | Merge PDF | organize | client | `@cantoo/pdf-lib` | `@pdfkit/core` | Done |
| `split` | Split PDF | organize | client | `@cantoo/pdf-lib` | `@pdfkit/core` | Done |
| `rotate` | Rotate PDF | organize | client | `@cantoo/pdf-lib` | `@pdfkit/core` | Done |
| `remove` | Remove Pages | organize | client | `@cantoo/pdf-lib` | `@pdfkit/core` | Done |
| `organize` | Organize PDF | organize | client | `@cantoo/pdf-lib` | `@pdfkit/core` | Done |
| `extract` | Extract Pages | organize | client | `@cantoo/pdf-lib` | `@pdfkit/core` | Done |
| `word-to-pdf` | Word to PDF | convert | client | `@cantoo/pdf-lib` + `jszip` | `@pdfkit/core` | Done |

## Planned Modules (Future Roadmap)

| Module ID | Title | Category | Library / Stack | Backend | Notes |
|---|---|---|---|---|---|
| `page-numbers` | Add Page Numbers | organize | `@cantoo/pdf-lib` | client | `page.drawText()` in loop |
| `watermark` | Add Watermark | edit | `@cantoo/pdf-lib` | client | `drawText()` / `drawImage()` per page |
| `edit` | Edit PDF (Overlay) | edit | `@cantoo/pdf-lib` | client | Text and shape annotations |
| `forms-fill` | Fill Form | edit | `@cantoo/pdf-lib` | client | `getForm()`, `getTextField()` |
| `forms-create` | Create Form | edit | `@cantoo/pdf-lib` | client | Interactive form fields |
| `forms-flatten` | Flatten Form | edit | `@cantoo/pdf-lib` | client | `getForm().flatten()` |
| `metadata` | Edit Metadata | edit | `@cantoo/pdf-lib` | client | `setTitle()`, `setAuthor()` |
| `img-to-pdf` | Image to PDF | convert | `@cantoo/pdf-lib` | client | Embed JPG/PNG images |
| `pdf-to-img` | PDF to Images | convert | `pdfjs-dist` | client | Render pages to PNG canvas |
| `compress` | Compress PDF | utility | `pdfjs-dist` + `@cantoo/pdf-lib` | client | Downscale image resolution |
| `compare` | Compare PDFs | utility | `pdfjs-dist` + `pixelmatch` | client | Visual pixel diffing |
| `repair` | Repair PDF | utility | `@cantoo/pdf-lib` | client | Tolerant object parsing |
| `protect` | Protect PDF | security | `@cantoo/pdf-lib` | client | AES-256 encryption |
| `unlock` | Unlock PDF | security | `@cantoo/pdf-lib` | client | Decrypt with password |
| `ocr-text` | Extract Text (OCR) | ocr | `tesseract.js` | client | WASM OCR extraction |

## Contributor Checklist: Adding a Module

Scaffold a clean template:
```bash
npm run new:module -- <id> "<Title>" <category>
# e.g.: npm run new:module -- watermark "Add Watermark" edit
```

Then complete the integration:
1. **Workspace Dependencies**:
   - In [`apps/web/package.json`](../apps/web/package.json), add `"@pdfkit/mod-<id>": "*"` to `dependencies`.
   - In [`apps/web/next.config.mjs`](../apps/web/next.config.mjs), add `"@pdfkit/mod-<id>"` to `transpilePackages`.
2. **Registry Wiring**:
   - In [`apps/web/lib/registry.ts`](../apps/web/lib/registry.ts), import the manifest and register the lazy loader:
     ```ts
     import { manifest as myTool } from "@pdfkit/mod-<id>/manifest";
     export const manifests: ToolManifest[] = [..., myTool];
     export const loaders = { ..., [myTool.id]: () => import("@pdfkit/mod-<id>") };
     ```
3. **Navigation & Routes**:
   - Navigation links are derived dynamically from `apps/web/lib/registry.ts`.
   - The route `/tools/<id>` will automatically resolve the tool.
4. **Tool UI**:
   - By default, unmapped tools render the generic `ToolRunner` component.
   - For custom interactive workflows (such as canvas manipulation or drag-and-drop), create a dedicated component in `apps/web/components/` and register it in `apps/web/lib/toolComponents.tsx`.
5. **Testing**:
   - Add module execution, validation, and error test suites in `scripts/test-modules.mjs`.
   - Run typecheck and test suites: `npm run typecheck && npm test`.
6. **Documentation**:
   - Add the tool entry and its supported options to `README.md` and `docs/MODULES.md`.

## Module-Specific Notes

### Split Module (`packages/mod-split`)
- **Default Size**: `DEFAULT_MAX_SIZE_BYTES = 500000` (500 KB) is shared identically across both `manifest.ts` and module execution (`index.ts`).
- **Single Page Limit**: When splitting by size, any individual page whose serialized size exceeds `maxSizeBytes` throws a descriptive `ToolError`.
- **`mergeAll` Invariant**: When `opts.mergeAll: true` is combined with `mode: "size"`, `mergeAll` is validated to ensure it cannot silently exceed the requested `maxSizeBytes`. If merging the parts into a single document produces or requires a file size greater than `maxSizeBytes`, a validation `ToolError` is thrown.

### Organize Module (`packages/mod-organize`)
- **Blank Page Dimension & Orientation Inheritance**: Blank pages inserted into a document inherit their width, height, and orientation from neighboring pages (or the document) rather than defaulting to hardcoded A4 portrait. Explicit `width` and `height` properties can also be specified on `OrganizePageItem`.
- **Blank Page Rotation**: Rotation angle (`0, 90, 180, 270`) on blank items is fully preserved and applied to the generated PDF page and UI canvas.
- **Relative Position Preservation**: Reordering files, sorting (A-Z, Z-A, 1-9, 9-1), interleaving, or removing files/pages preserves inserted blank pages at their relative positions (start, middle, end) via `reinsertBlanksAtRelativePositions`.

### Remove Module (`packages/mod-remove`)
- **Strict Page Index Validation**: When providing `opts.pageIndices`, every element must be an integer within `[0, total - 1]`. Any out-of-range, negative, non-integer, or non-numeric index immediately rejects the request with an actionable `ToolError`.
- **Atomic Operations**: No silent filtering or partial page removals occur. Deduplication happens only after every index passes validation.

### Extract Module (`packages/mod-extract`)
- **Configurable Extraction**: Supports selective extraction via zero-based page indices (`opts.pages`) or extracting all pages into separate single-page documents.
- **Combined Output**: When `opts.mergeAll: true` is set, extracted pages are combined into a single continuous PDF document (`outputName` or `<name>_extracted.pdf`).
- **Input Verification**: Validates that page indices exist within `[0, total - 1]` and prevents empty extractions.

## Payload & Memory Limits (Web & Core)

To protect client-side browsers and Web Workers from out-of-memory crashes, strict input validation limits are defined centrally in `@pdfkit/core`:

| Limit Parameter | Default Value | Description |
|---|---|---|
| `maxFileSizeBytes` | 100 MB (`100 * 1024 * 1024`) | Maximum allowed size per input file. |
| `maxTotalSizeBytes` | 250 MB (`250 * 1024 * 1024`) | Maximum cumulative size across all input files. |
| `maxFileCount` | 50 files | Maximum number of concurrent input files. |
| `warningTotalSizeBytes` | 50 MB (`50 * 1024 * 1024`) | Threshold to trigger memory warning banner. |
| `warningFileCount` | 20 files | File count threshold to trigger memory warning banner. |

- **Upfront Validation**: Validated on file selection/drop via native `File.size` before reading data into memory (`arrayBuffer()`), as well as inside `runTool()` prior to worker dispatch.
- **Sequential ArrayBuffer Reading**: Large batches read ArrayBuffers sequentially (`for ... of`) rather than concurrently (`Promise.all`) to avoid memory allocation spikes.
- **PayloadLimitError**: Throws structured errors with `code: "FILE_TOO_LARGE" | "TOO_MANY_FILES" | "TOTAL_SIZE_TOO_LARGE"` detailing `limit`, `actual`, and offending `fileName`.
