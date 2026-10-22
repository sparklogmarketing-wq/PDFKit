"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { renderPdfPage, getPdfInfo } from "../lib/pdfjs";
import { useInView } from "../lib/useInView";
import { runTool, isCancelledError } from "../lib/runTool";
import { downloadFilesAsZip } from "../lib/downloadZip";
import { formatBytes } from "../lib/formatBytes";
import PdfZoomModal from "./PdfZoomModal";
import type { OutputFile } from "@pdfkit/core";

type ExtractMode = "select" | "all";

/* ── Outer-scope pure helpers to satisfy SonarCloud ─────────── */
function parsePageRanges(text: string, maxPages: number): Set<number> {
  const result = new Set<number>();
  if (!text || !text.trim()) return result;
  const parts = text.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes("-")) {
      const [startStr, endStr] = trimmed.split("-");
      const start = Math.max(1, Math.min(maxPages, Number(startStr?.trim()) || 1));
      const end = endStr && endStr.trim()
        ? Math.max(1, Math.min(maxPages, Number(endStr.trim()) || maxPages))
        : maxPages;
      const [from, to] = start <= end ? [start, end] : [end, start];
      for (let p = from; p <= to; p++) {
        result.add(p);
      }
    } else {
      const p = Number(trimmed);
      if (p >= 1 && p <= maxPages) {
        result.add(p);
      }
    }
  }
  return result;
}

function formatPageRanges(pages: number[]): string {
  if (pages.length === 0) return "";
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = cur;
      prev = cur;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(", ");
}

/* ── Thumbnail Card Component ───────────────────────────────── */
interface ExtractPageThumbProps {
  readonly file: File;
  readonly pageNum: number;
  readonly isSelected: boolean;
  readonly onToggle: (pageNum: number) => void;
  readonly onZoom: (file: File, pageNum: number) => void;
}

function ExtractPageThumb({
  file,
  pageNum,
  isSelected,
  onToggle,
  onZoom,
}: ExtractPageThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const { ref: containerRef, isInView } = useInView<HTMLDivElement>({ rootMargin: "300px 0px" });
  const [hasRendered, setHasRendered] = useState(false);

  useEffect(() => {
    if (!isInView && !hasRendered) return;
    if (hasRendered) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    if (canvasRef.current) {
      void renderPdfPage(file, canvasRef.current, pageNum, 180, { signal: controller.signal })
        .then((res) => {
          if (!active) return;
          setLoading(false);
          if (res) setHasRendered(true);
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [file, pageNum, isInView, hasRendered]);

  return (
    <div
      ref={containerRef}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      className={`extract-page-thumb ${isSelected ? "selected" : ""}`}
      onClick={() => onToggle(pageNum)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(pageNum);
        }
      }}
      aria-label={`Page ${pageNum}${isSelected ? ", selected" : ", unselected"}`}
    >
      <div className="extract-page-thumb-top">
        <div className={`extract-page-check ${isSelected ? "checked" : ""}`}>
          {isSelected && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>

        <button
          type="button"
          className="split-page-zoom-btn"
          onClick={(e) => {
            e.stopPropagation();
            onZoom(file, pageNum);
          }}
          title="Zoom page"
          aria-label="Zoom page"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
      </div>

      <div className="extract-page-sheet">
        {loading && (
          <div className="pdf-thumb-skeleton">
            <div className="pdf-thumb-spinner" />
          </div>
        )}
        <canvas ref={canvasRef} className="pdf-thumb-canvas" />
      </div>

      <span className="extract-page-num-badge">Page {pageNum}</span>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────── */
export default function ExtractTool() {
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [fileSize, setFileSize] = useState<number>(0);

  const [extractMode, setExtractMode] = useState<ExtractMode>("select");
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [pagesInput, setPagesInput] = useState<string>("");
  const [mergeAll, setMergeAll] = useState<boolean>(true);
  const [outputName, setOutputName] = useState<string>("");

  const [zoomPage, setZoomPage] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ name: string; url: string; size: number }[] | null>(null);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [cancelTask, setCancelTask] = useState<(() => void) | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  /* Cleanup object URLs when results change or unmount */
  useEffect(() => {
    return () => {
      if (results) {
        results.forEach((r) => URL.revokeObjectURL(r.url));
      }
    };
  }, [results]);

  /* Handle PDF file selection */
  const loadPdfFile = useCallback(async (selectedFile: File) => {
    setError(null);
    setResults(null);
    try {
      const info = await getPdfInfo(selectedFile);
      if (!info || info.numPages <= 0) {
        setError("The selected PDF file has no pages or could not be read.");
        return;
      }
      setFile(selectedFile);
      setTotalPages(info.numPages);
      setFileSize(selectedFile.size);

      // Default: select all pages initially
      const all = new Set<number>();
      for (let i = 1; i <= info.numPages; i++) {
        all.add(i);
      }
      setSelectedPages(all);
      setPagesInput(`1-${info.numPages}`);
      setExtractMode("select");
      setMergeAll(true);
      setOutputName("");
    } catch (err: any) {
      setError(err?.message || "Failed to load PDF file.");
    }
  }, []);

  const handleTogglePage = useCallback(
    (pageNum: number) => {
      setSelectedPages((prev) => {
        const next = new Set(prev);
        if (next.has(pageNum)) {
          next.delete(pageNum);
        } else {
          next.add(pageNum);
        }
        setPagesInput(formatPageRanges(Array.from(next)));
        return next;
      });
    },
    []
  );

  const handleSelectAll = useCallback(() => {
    if (!totalPages) return;
    const all = new Set<number>();
    for (let i = 1; i <= totalPages; i++) {
      all.add(i);
    }
    setSelectedPages(all);
    setPagesInput(`1-${totalPages}`);
  }, [totalPages]);

  const handleDeselectAll = useCallback(() => {
    setSelectedPages(new Set());
    setPagesInput("");
  }, []);

  const handlePagesInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setPagesInput(val);
      setSelectedPages(parsePageRanges(val, totalPages));
    },
    [totalPages]
  );

  const handleExtract = useCallback(async () => {
    if (!file || totalPages === 0) return;
    if (extractMode === "select" && selectedPages.size === 0) {
      setError("Please select at least one page to extract.");
      return;
    }

    setIsRunning(true);
    setProgress(0);
    setError(null);

    try {
      const buf = await file.arrayBuffer();
      const inputData = new Uint8Array(buf);

      // Convert 1-based page numbers to 0-based for module
      const pagesToExtract =
        extractMode === "all"
          ? []
          : Array.from(selectedPages).sort((a, b) => a - b).map((p) => p - 1);

      const runner = runTool(
        "extract",
        [{ name: file.name, data: inputData }],
        {
          mode: extractMode,
          pages: extractMode === "all" ? undefined : pagesToExtract,
          mergeAll,
          outputName: outputName.trim() || undefined,
        },
        (p) => setProgress(p)
      );

      setCancelTask(() => runner.cancel);
      const outputs = await runner.promise;

      const outputFiles = outputs.map((out: OutputFile) => ({
        name: out.name,
        url: URL.createObjectURL(new Blob([out.data.buffer as ArrayBuffer], { type: out.mime })),
        size: out.data.byteLength,
      }));

      setResults(outputFiles);
    } catch (err: any) {
      if (!isCancelledError(err)) {
        setError(err?.message || "Failed to extract pages.");
      }
    } finally {
      setIsRunning(false);
      setProgress(null);
      setCancelTask(null);
    }
  }, [file, totalPages, extractMode, selectedPages, mergeAll, outputName]);

  const handleDownloadAllZip = useCallback(async () => {
    if (!results || results.length === 0 || isZipping) return;
    setIsZipping(true);
    try {
      const base = file?.name.replace(/\.pdf$/i, "") ?? "extracted";
      await downloadFilesAsZip(results, `${base}-extracted.zip`);
    } catch (err: any) {
      setError("Failed to create ZIP: " + (err?.message || "Unknown error"));
    } finally {
      setIsZipping(false);
    }
  }, [results, isZipping, file]);

  const handleReset = useCallback(() => {
    setFile(null);
    setTotalPages(0);
    setSelectedPages(new Set());
    setPagesInput("");
    setResults(null);
    setError(null);
  }, []);

  /* ── 1. Upload View ───────────────────────────────────────── */
  if (!file) {
    return (
      <div className="tool-runner-panel">
        <button
          type="button"
          className={`dropzone ${isDragging ? "active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped && dropped.name.toLowerCase().endsWith(".pdf")) {
              void loadPdfFile(dropped);
            } else {
              setError("Please select a valid PDF file.");
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{ width: "100%", fontFamily: "inherit", cursor: "pointer" }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) void loadPdfFile(selected);
            }}
          />
          <div className="dropzone-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M12 18v-6" />
              <path d="m9 15 3-3 3 3" />
            </svg>
          </div>
          <p className="dropzone-text-primary">Select PDF file</p>
          <p className="dropzone-text-secondary">or drop PDF here to extract pages</p>
          <span className="dropzone-badge">PDF only</span>
        </button>

        {error && (
          <div className="alert-error" style={{ marginTop: "1rem" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}
      </div>
    );
  }

  /* ── 2. Results View ──────────────────────────────────────── */
  if (results) {
    const isSingle = results.length === 1;
    return (
      <div className="tool-runner-panel" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--success-subtle)",
            color: "var(--success)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.5rem" }}>
          PDF Pages Extracted!
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", fontSize: "0.95rem" }}>
          {isSingle
            ? "Your extracted PDF is ready for download."
            : `${results.length} separate PDF files were successfully generated.`}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 360, margin: "0 auto" }}>
          {isSingle ? (
            <a
              href={results[0].url}
              download={results[0].name}
              className="split-run-btn"
              style={{ textDecoration: "none" }}
            >
              Download PDF ({formatBytes(results[0].size)})
            </a>
          ) : (
            <button
              type="button"
              className="split-run-btn"
              onClick={handleDownloadAllZip}
              disabled={isZipping}
            >
              {isZipping ? "Creating ZIP…" : `Download All as ZIP (${results.length} PDFs)`}
            </button>
          )}

          <button type="button" className="btn-secondary" onClick={handleReset}>
            Extract Another PDF
          </button>
        </div>
      </div>
    );
  }

  /* ── 3. Main Workspace ────────────────────────────────────── */
  const selectedCount = extractMode === "all" ? totalPages : selectedPages.size;
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="split-tool-wrap">
      {/* Zoom Lightbox Modal */}
      {zoomPage !== null && (
        <PdfZoomModal
          file={file}
          pageNum={zoomPage}
          onClose={() => setZoomPage(null)}
        />
      )}

      {/* Two-pane layout */}
      <div className="split-layout">
        {/* LEFT: Grid of pages */}
        <div className="split-preview-panel">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem",
              paddingBottom: "0.75rem",
              borderBottom: "1px solid var(--border-light)",
            }}
          >
            <div>
              <strong style={{ fontSize: "0.95rem", color: "var(--text-main)" }}>{file.name}</strong>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                {totalPages} {totalPages === 1 ? "page" : "pages"} &bull; {formatBytes(fileSize)}
              </div>
            </div>
            <button
              type="button"
              className="btn-preview"
              onClick={handleReset}
              style={{ fontSize: "0.8125rem", padding: "0.4rem 0.8rem" }}
            >
              Change file
            </button>
          </div>

          {/* Quick Select Actions */}
          {extractMode === "select" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1rem",
                padding: "0.5rem 0.75rem",
                background: "var(--primary-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-light)",
              }}
            >
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--primary-dark)" }}>
                Selected {selectedCount} of {totalPages} {totalPages === 1 ? "page" : "pages"}
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="extract-quick-btn"
                  onClick={handleSelectAll}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="extract-quick-btn"
                  onClick={handleDeselectAll}
                >
                  Deselect all
                </button>
              </div>
            </div>
          )}

          {/* Pages Grid */}
          <div className="extract-pages-grid">
            {pageNumbers.map((pageNum) => (
              <ExtractPageThumb
                key={pageNum}
                file={file}
                pageNum={pageNum}
                isSelected={extractMode === "all" || selectedPages.has(pageNum)}
                onToggle={handleTogglePage}
                onZoom={(f, num) => setZoomPage(num)}
              />
            ))}
          </div>
        </div>

        {/* RIGHT: Config sidebar */}
        <div className="split-config-panel">
          <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
            Extract Pages
          </h2>

          {/* Mode switch */}
          <div className="split-submode-row">
            <label style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-secondary)" }}>
              Extract mode:
            </label>
            <div className="split-submode-tabs">
              <button
                type="button"
                className={`split-submode-btn ${extractMode === "select" ? "active" : ""}`}
                onClick={() => setExtractMode("select")}
              >
                Select pages
              </button>
              <button
                type="button"
                className={`split-submode-btn ${extractMode === "all" ? "active" : ""}`}
                onClick={() => setExtractMode("all")}
              >
                Extract all pages
              </button>
            </div>
          </div>

          {/* Pages to extract range input (for select mode) */}
          {extractMode === "select" && (
            <div className="split-submode-row">
              <label
                htmlFor="extract-pages-input"
                style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-secondary)" }}
              >
                Pages to extract:
              </label>
              <input
                id="extract-pages-input"
                type="text"
                className="split-text-input"
                value={pagesInput}
                onChange={handlePagesInputChange}
                placeholder="e.g. 1, 3-5, 8"
                aria-label="Pages to extract specification"
              />
            </div>
          )}

          {/* Merge toggle */}
          <label className="split-merge-check">
            <input
              type="checkbox"
              checked={mergeAll}
              onChange={(e) => setMergeAll(e.target.checked)}
            />
            <span style={{ fontWeight: 600, color: "var(--text-main)" }}>
              Merge extracted pages into one PDF
            </span>
          </label>

          {/* Custom output name if merging */}
          {mergeAll && (
            <div className="split-submode-row">
              <label
                htmlFor="extract-output-name"
                style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-secondary)" }}
              >
                Output filename (optional):
              </label>
              <input
                id="extract-output-name"
                type="text"
                className="split-text-input"
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
                placeholder={`${file.name.replace(/\.pdf$/i, "")}-extracted.pdf`}
                aria-label="Custom output filename"
              />
            </div>
          )}

          {/* Information box */}
          <div className="split-info-box">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div>
              {selectedCount === 0 ? (
                <span>Please select at least one page from the grid or enter page numbers above.</span>
              ) : mergeAll ? (
                <span>
                  Selected {selectedCount} {selectedCount === 1 ? "page" : "pages"} will be merged into <strong>1 PDF</strong>.
                </span>
              ) : (
                <span>
                  Selected {selectedCount} {selectedCount === 1 ? "page" : "pages"} will be saved as <strong>{selectedCount} separate PDF files</strong>.
                </span>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="alert-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {/* Progress Indicator */}
          {isRunning && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ height: 6, background: "#e9e5ff", borderRadius: 99, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg, var(--primary), #a855f7)",
                    borderRadius: 99,
                    width: `${Math.round((progress ?? 0) * 100)}%`,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>
                Extracting pages… {Math.round((progress ?? 0) * 100)}%
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginTop: "0.25rem" }}>
            {isRunning ? (
              <button
                type="button"
                className="btn-danger-outline"
                onClick={() => { cancelTask?.(); }}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="split-run-btn"
                onClick={handleExtract}
                disabled={selectedCount === 0}
              >
                Extract Pages
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 8 16 12 12 16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </button>
            )}

            <button type="button" className="btn-secondary" onClick={handleReset}>
              Choose different file
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
