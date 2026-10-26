"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { renderPdfPage, getPdfInfo } from "../lib/pdfjs";
import { usePdfThumbnail } from "../lib/usePdfThumbnail";
import { runTool, isCancelledError } from "../lib/runTool";
import { downloadFilesAsZip, useZipDownload } from "../lib/downloadZip";
import { formatPageRanges, parsePageRanges } from "../lib/pageRanges";
import { validateFilesForUpload } from "../lib/limits";
import { formatBytes } from "../lib/formatBytes";
import { uint8ArrayToBlob } from "../lib/format";
import PdfZoomModal from "./PdfZoomModal";
import type { OutputFile } from "@pdfkit/core";

/* ── Types ─────────────────────────────────────────────────── */
interface Range {
  id: number;
  from: number | string;
  to: number | string;
}

type SplitTab = "range" | "pages" | "size";
type ExtractMode = "all" | "select";

function formatFileSizeExact(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(2)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

/* ── Range row palette ────────────────────────────────────── */
const RANGE_COLORS = [
  "#7c3aed", "#059669", "#d97706", "#dc2626",
  "#0284c7", "#7c3aed", "#be185d", "#4f46e5",
];

/* ── Tiny page thumbnail for Range Mode ───────────────────── */
function PageThumb({
  file,
  pageNum,
  rangeColor,
}: {
  file: File;
  pageNum: number;
  rangeColor: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    if (canvasRef.current) {
      renderPdfPage(file, canvasRef.current, pageNum, 160).then(() => {
        if (active) setLoading(false);
      });
    }
    return () => { active = false; };
  }, [file, pageNum]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.35rem",
      }}
    >
      <div
        style={{
          width: 80,
          aspectRatio: "1/1.35",
          border: `2px solid ${rangeColor}`,
          borderRadius: 6,
          background: "#fff",
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 2px 6px rgba(0,0,0,0.10)",
          flexShrink: 0,
        }}
      >
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "#f8fafc",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div className="pdf-thumb-spinner" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </div>
      <span
        style={{
          fontSize: "0.7rem",
          fontWeight: 700,
          color: "#64748b",
          background: "#f1f5f9",
          borderRadius: 99,
          padding: "0.1rem 0.45rem",
          lineHeight: 1.4,
        }}
      >
        {pageNum}
      </span>
    </div>
  );
}

/* ── Interactive Page Card for Pages Mode ─────────────────── */
function SelectablePageCard({
  file,
  pageNum,
  isSelected,
  onToggle,
  onZoom,
}: {
  file: File;
  pageNum: number;
  isSelected: boolean;
  onToggle: (p: number) => void;
  onZoom: (file: File, pageNum: number) => void;
}) {
  const { canvasRef, containerRef, loading } = usePdfThumbnail({
    file,
    pageNum,
    targetWidth: 160,
    rootMargin: "300px 0px",
  });

  return (
    <div
      ref={containerRef}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      aria-label={`Page ${pageNum}${isSelected ? ", selected" : ", not selected"}`}
      className={`split-page-thumb ${isSelected ? "selected" : ""}`}
      onClick={() => onToggle(pageNum)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(pageNum);
        }
      }}
    >
      <div className="split-page-thumb-top">
        <div className={`split-page-check ${isSelected ? "checked" : ""}`} aria-hidden="true">
          {isSelected && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
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
          title={`Zoom page ${pageNum}`}
          aria-label={`Zoom page ${pageNum}`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
      </div>

      <div className="split-page-sheet">
        {loading && (
          <div className="pdf-thumb-skeleton">
            <div className="pdf-thumb-spinner" />
          </div>
        )}
        <canvas ref={canvasRef} className="pdf-thumb-canvas" />
      </div>

      <div className="split-page-num-badge">
        {pageNum}
      </div>
    </div>
  );
}

/* ── Centered Single Document Preview for Size Mode ───────── */
function SingleDocumentPreview({ file, onZoom }: { file: File; onZoom: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const controller = new AbortController();
    if (canvasRef.current) {
      renderPdfPage(file, canvasRef.current, 1, 260, { signal: controller.signal })
        .then(() => {
          if (active) setLoading(false);
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [file]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1rem",
        minHeight: 340,
      }}
    >
      <div
        style={{
          width: 180,
          aspectRatio: "1 / 1.35",
          background: "#ffffff",
          border: "1.5px solid var(--border-light)",
          borderRadius: 8,
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
        onClick={onZoom}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onZoom();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Preview first page"
        title="Click to zoom preview"
      >
        {loading && (
          <div className="pdf-thumb-skeleton">
            <div className="pdf-thumb-spinner" />
          </div>
        )}
        <canvas ref={canvasRef} className="pdf-thumb-canvas" />

        <button
          type="button"
          className="split-page-zoom-btn"
          style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26 }}
          onClick={(e) => {
            e.stopPropagation();
            onZoom();
          }}
          title="Zoom preview"
          aria-label="Zoom preview"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
      </div>

      <span
        style={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "var(--text-secondary)",
          marginTop: "0.875rem",
          maxWidth: 240,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={file.name}
      >
        {file.name}
      </span>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────── */
export default function SplitTool() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  /* Top tab: Range vs Pages */
  const [activeTab, setActiveTab] = useState<SplitTab>("pages");

  /* Range mode config */
  const [rangeMode, setRangeMode] = useState<"custom" | "fixed">("custom");
  const [ranges, setRanges] = useState<Range[]>([{ id: 1, from: 1, to: 1 }]);
  const [nextId, setNextId] = useState(2);
  const [mergeAllRanges, setMergeAllRanges] = useState(false);
  const [everyN, setEveryN] = useState<number | string>(1);

  /* Pages mode config */
  const [extractMode, setExtractMode] = useState<ExtractMode>("select");
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [pagesInput, setPagesInput] = useState<string>("");
  const [mergeExtracted, setMergeExtracted] = useState<boolean>(false);

  /* Size mode config */
  const [sizeValue, setSizeValue] = useState<string>("292");
  const [sizeUnit, setSizeUnit] = useState<"KB" | "MB">("KB");
  const [allowCompression, setAllowCompression] = useState<boolean>(true);

  function handleUnitChange(newUnit: "KB" | "MB") {
    if (newUnit === sizeUnit) return;
    const curVal = Number(sizeValue) || 0;
    if (newUnit === "MB") {
      const mbVal = Math.max(0.1, parseFloat((curVal / 1024).toFixed(2)));
      setSizeValue(String(mbVal));
    } else {
      const kbVal = Math.max(1, Math.round(curVal * 1024));
      setSizeValue(String(kbVal));
    }
    setSizeUnit(newUnit);
  }

  /* Zoom modal state */
  const [zoomPage, setZoomPage] = useState<number | null>(null);

  /* Run state */
  const [progress, setProgress] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<{ name: string; url: string; size: number }[]>([]);
  const [cancel, setCancel] = useState<(() => void) | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  cancelRef.current = cancel;
  const loadIdRef = useRef(0);
  const runIdRef = useRef(0);
  const { isZipping, zipError, downloadZip, clearZipError } = useZipDownload();
  const isRunning = progress !== null;

  /* cleanup urls and cancel active job on unmount */
  useEffect(() => () => {
    cancelRef.current?.();
    results.forEach((r) => URL.revokeObjectURL(r.url));
  }, [results]);

  async function handleDownloadAllZip() {
    if (results.length === 0) return;
    const baseName = file ? file.name.replace(/\.pdf$/i, "") : "split_files";
    await downloadZip(results, `${baseName}_split.zip`);
  }

  /* ── File handling ──────────────────────────────────────── */
  async function loadFile(f: File) {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }

    const validation = validateFilesForUpload([f]);
    if (validation.error) {
      setError(validation.error);
      return;
    }
    cancelRef.current?.();
    setCancel(null);
    runIdRef.current++;
    const loadId = ++loadIdRef.current;

    setError("");
    setResults([]);
    setProgress(null);
    setStatusMsg("");

    const info = await getPdfInfo(f);
    if (loadId !== loadIdRef.current) return;

    setFile(f);
    const n = info?.numPages ?? 0;
    setTotalPages(n);
    setRanges([{ id: 1, from: 1, to: n || 1 }]);
    setNextId(2);

    // Initialise pages selection: all pages selected by default or 1st page
    const initialPages = n > 0 ? [1] : [];
    setSelectedPages(new Set(initialPages));
    setPagesInput(formatPageRanges(initialPages));
    setExtractMode("select");

    // Initialise size mode defaults based on file size
    const defaultKb = Math.max(20, Math.round((f.size / 1024) / (n > 1 ? Math.min(n, 3) : 2)));
    setSizeUnit("KB");
    setSizeValue(String(defaultKb));
    setAllowCompression(true);
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) loadFile(e.target.files[0]);
    e.target.value = "";
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) loadFile(f);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  /* ── Range Mode functions ───────────────────────────────── */
  function addRange() {
    const last = ranges[ranges.length - 1];
    const lastTo = Number(last ? last.to : 0) || 1;
    const from = Math.min(lastTo + 1, totalPages || 1);
    setRanges((prev) => [...prev, { id: nextId, from, to: totalPages || from }]);
    setNextId((n) => n + 1);
  }

  function removeRange(id: number) {
    if (ranges.length <= 1) return;
    setRanges((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRange(id: number, field: "from" | "to", raw: string) {
    const sanitized = raw.replace(/[^0-9]/g, "");
    setRanges((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return { ...r, [field]: sanitized };
      })
    );
  }

  function handleRangeBlur(id: number, field: "from" | "to") {
    setRanges((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        let fromVal = Number(r.from) || 1;
        let toVal = Number(r.to) || (totalPages || fromVal);

        fromVal = Math.max(1, Math.min(totalPages || 9999, fromVal));
        toVal = Math.max(1, Math.min(totalPages || 9999, toVal));

        if (field === "from") {
          if (fromVal > toVal) toVal = fromVal;
        } else {
          if (toVal < fromVal) fromVal = toVal;
        }

        return { ...r, from: fromVal, to: toVal };
      })
    );
  }

  function adjustRangeStep(id: number, field: "from" | "to", delta: number) {
    setRanges((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        let currentFrom = Number(r.from) || 1;
        let currentTo = Number(r.to) || (totalPages || currentFrom);

        if (field === "from") {
          let newFrom = Math.max(1, Math.min(totalPages || 9999, currentFrom + delta));
          let newTo = Math.max(newFrom, currentTo);
          return { ...r, from: newFrom, to: newTo };
        } else {
          let newTo = Math.max(1, Math.min(totalPages || 9999, currentTo + delta));
          let newFrom = Math.min(newTo, currentFrom);
          return { ...r, from: newFrom, to: newTo };
        }
      })
    );
  }

  function pagesForRange(r: Range): number[] {
    const rawFrom = Number(r.from);
    const rawTo = Number(r.to);
    const fromNum = Math.max(1, Math.min(totalPages || 1, rawFrom || 1));
    const toNum = Math.max(fromNum, Math.min(totalPages || fromNum, rawTo || fromNum));
    const pages: number[] = [];
    for (let p = fromNum; p <= toNum; p++) pages.push(p);
    return pages;
  }

  /* ── Pages Mode functions ───────────────────────────────── */
  function togglePageSelection(pageNum: number) {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) {
        next.delete(pageNum);
      } else {
        next.add(pageNum);
      }
      const formatted = formatPageRanges(Array.from(next));
      setPagesInput(formatted);
      return next;
    });
    setExtractMode("select");
  }

  function handleSelectAllPages() {
    setExtractMode("all");
    const all = Array.from({ length: totalPages }, (_, i) => i + 1);
    setSelectedPages(new Set(all));
    setPagesInput(totalPages > 1 ? `1-${totalPages}` : "1");
  }

  function handleCustomSelectMode() {
    setExtractMode("select");
  }

  function handlePagesInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setPagesInput(val);
    const parsed = parsePageRanges(val, totalPages);
    setSelectedPages(parsed);
    setExtractMode("select");
  }

  /* ── Run ────────────────────────────────────────────────── */
  async function run() {
    if (!file) return;
    setError("");
    setResults([]);
    setProgress(0.05);
    setStatusMsg("Reading file…");

    let effectiveOpts: any;

    if (activeTab === "size") {
      const num = Number(sizeValue);
      if (!num || num <= 0) {
        setError("Please enter a valid maximum file size.");
        setProgress(null);
        return;
      }
      const maxSizeBytes = sizeUnit === "MB" ? Math.round(num * 1024 * 1024) : Math.round(num * 1024);
      effectiveOpts = {
        mode: "size",
        maxSizeBytes,
        allowCompression,
      };
    } else if (activeTab === "pages") {
      const list = Array.from(selectedPages).sort((a, b) => a - b);
      if (list.length === 0) {
        setError("Please select at least one page to extract.");
        setProgress(null);
        return;
      }
      // Pass each page as a discrete range if not merging, so each page is a separate PDF
      effectiveOpts = {
        mode: "ranges",
        ranges: list.join(","),
        n: 1,
        mergeAll: mergeExtracted,
      };
    } else {
      // Range mode
      if (rangeMode === "fixed") {
        const effectiveN = Math.max(1, Number(everyN) || 1);
        effectiveOpts = {
          mode: "every",
          ranges: "",
          n: effectiveN,
          mergeAll: false,
        };
      } else {
        const sanitizedRanges = ranges.map((r) => {
          const from = Math.max(1, Math.min(totalPages || 1, Number(r.from) || 1));
          const to = Math.max(from, Math.min(totalPages || from, Number(r.to) || from));
          return { ...r, from, to };
        });
        const rangesStr = sanitizedRanges
          .map((r) => (r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`))
          .join(",");

        effectiveOpts = {
          mode: "ranges",
          ranges: rangesStr,
          n: 1,
          mergeAll: mergeAllRanges,
        };
      }
    }

    const runId = ++runIdRef.current;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      if (runId !== runIdRef.current) return;
      const job = runTool("split", [{ name: file.name, data }], effectiveOpts, (p) => {
        if (runId === runIdRef.current) {
          setProgress((prev) => (prev === null ? Math.max(0.1, p) : Math.max(prev, p)));
          setStatusMsg(`Processing (${Math.round(p * 100)}%)…`);
        }
      });
      setCancel(() => () => job.cancel());
      const outputs: OutputFile[] = await job.promise;
      if (runId !== runIdRef.current || !file) return;

      const mapped = outputs.map((o) => ({
        name: o.name,
        url: URL.createObjectURL(uint8ArrayToBlob(o.data, o.mime)),
        size: o.data.byteLength,
      }));
      setResults(mapped);
    } catch (err: any) {
      if (runId === runIdRef.current && !isCancelledError(err)) {
        setError(err?.message ?? "An error occurred.");
      }
    } finally {
      if (runId === runIdRef.current) {
        setProgress(null);
        setStatusMsg("");
        setCancel(null);
      }
    }
  }

  function reset() {
    cancelRef.current?.();
    loadIdRef.current++;
    runIdRef.current++;
    setFile(null);
    setTotalPages(0);
    setRanges([{ id: 1, from: 1, to: 1 }]);
    setNextId(2);
    setSelectedPages(new Set());
    setPagesInput("");
    setSizeValue("292");
    setSizeUnit("KB");
    setAllowCompression(true);
    setResults([]);
    setError("");
    clearZipError();
    setProgress(null);
    setStatusMsg("");
    setCancel(null);
  }

  /* ── Render: Dropzone ───────────────────────────────────── */
  if (!file) {
    return (
      <div className="tool-runner-panel">
        <div className="dropzone-container">
          <div
            className={`dropzone ${isDragging ? "active" : ""}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={onInputChange}
            />

            <svg
              className="dropzone-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>

            <p className="dropzone-text-primary">
              Choose a PDF file, or drag and drop here
            </p>
            <span className="dropzone-badge">
              Single file (.pdf)
            </span>
          </div>

          {error && (
            <div className="alert-error" style={{ marginTop: "1rem" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Render: Results ─────────────────────────────────────── */
  if (results.length > 0 && file) {
    return (
      <div className="split-tool-wrap">
        <div
          style={{
            background: "#f0fdf4",
            border: "1.5px solid #a7f3d0",
            borderRadius: "var(--radius-lg)",
            padding: "1.25rem 1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          <strong style={{ color: "#065f46" }}>Split complete — {results.length} file{results.length !== 1 ? "s" : ""} ready</strong>
        </div>

        {(zipError || error) && (
          <div
            role="alert"
            className="alert-error"
            style={{ marginBottom: "1rem" }}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>{zipError || error}</div>
          </div>
        )}

        {activeTab === "size" && results.some((r) => r.size > (sizeUnit === "MB" ? Number(sizeValue) * 1024 * 1024 : Number(sizeValue) * 1024)) && (
          <div
            style={{
              background: "#eff6ff",
              border: "1.5px solid #bfdbfe",
              borderRadius: "var(--radius-md)",
              padding: "0.75rem 1rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              marginBottom: "1rem",
              fontSize: "0.8125rem",
              color: "#1e40af",
              lineHeight: 1.45,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div>
              <strong>Atomic page notice:</strong> A PDF cannot slice a single page in half. Files larger than {sizeValue} {sizeUnit} contain an individual page whose graphics/diagrams inherently exceed the target size limit.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {results.map((r, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.875rem 1.125rem",
                border: "1.5px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                background: "#fff",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{formatBytes(r.size)}</div>
                </div>
              </div>
              <a
                href={r.url}
                download={r.name}
                className="btn-primary"
                style={{ whiteSpace: "nowrap", padding: "0.5rem 1.1rem", fontSize: "0.85rem", textDecoration: "none" }}
              >
                Download
              </a>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button onClick={reset} className="btn-secondary" style={{ flex: 1 }}>
            Split another PDF
          </button>
          {results.length > 1 && (
            <button
              onClick={handleDownloadAllZip}
              className="btn-primary"
              disabled={isZipping}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              {isZipping ? (
                <>
                  <div className="btn-spinner" />
                  Creating ZIP…
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="21 8 21 21 3 21 3 8" />
                    <rect x="1" y="3" width="22" height="5" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                  Download All (.zip)
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Render: Main Split UI ──────────────────────────────── */
  const selectedCount = selectedPages.size;

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

        {/* LEFT: Page Preview Panel */}
        <div className="split-preview-panel">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: 700,
                color: "var(--text-secondary)",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "calc(100% - 100px)",
              }}
              title={file.name}
            >
              {file.name}
            </span>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-subtle)", padding: "0.2rem 0.6rem", borderRadius: 99 }}>
              {totalPages} {totalPages === 1 ? "page" : "pages"}
            </span>
          </div>

          {/* PAGES TAB PREVIEW: Selectable Grid */}
          {activeTab === "pages" && (
            <div className="split-pages-grid">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <SelectablePageCard
                  key={p}
                  file={file}
                  pageNum={p}
                  isSelected={selectedPages.has(p)}
                  onToggle={togglePageSelection}
                  onZoom={(f, num) => setZoomPage(num)}
                />
              ))}
            </div>
          )}

          {/* SIZE TAB PREVIEW: Single centered document card */}
          {activeTab === "size" && (
            <SingleDocumentPreview
              file={file}
              onZoom={() => setZoomPage(1)}
            />
          )}

          {/* RANGE TAB PREVIEW */}
          {activeTab === "range" && rangeMode === "custom" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {ranges.map((r, ri) => {
                const color = RANGE_COLORS[ri % RANGE_COLORS.length];
                const pages = pagesForRange(r);
                return (
                  <div key={r.id}>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color,
                        marginBottom: "0.5rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      Range {ri + 1} — Pages {r.from || 1}–{r.to || totalPages || 1}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.625rem",
                        padding: "0.875rem",
                        background: "#fafbfc",
                        border: `2px solid ${color}22`,
                        borderRadius: 6,
                      }}
                    >
                      {pages.slice(0, 24).map((p) => (
                        <PageThumb key={p} file={file} pageNum={p} rangeColor={color} />
                      ))}
                      {pages.length > 24 && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 80,
                            aspectRatio: "1/1.35",
                            background: "#f1f5f9",
                            border: "2px dashed #cbd5e1",
                            borderRadius: 6,
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "#64748b",
                          }}
                        >
                          +{pages.length - 24} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "range" && rangeMode === "fixed" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
              {Array.from({ length: Math.min(totalPages, 40) }, (_, i) => i + 1).map((p) => (
                <PageThumb
                  key={p}
                  file={file}
                  pageNum={p}
                  rangeColor={RANGE_COLORS[Math.floor((p - 1) / (Number(everyN) || 1)) % RANGE_COLORS.length]}
                />
              ))}
              {totalPages > 40 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 80, aspectRatio: "1/1.35", background: "#f1f5f9", border: "2px dashed #cbd5e1", borderRadius: 6, fontSize: "0.75rem", fontWeight: 700, color: "#64748b" }}>
                  +{totalPages - 40} more
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Config Panel */}
        <div className="split-config-panel">
          <h2 style={{ fontSize: "1.375rem", fontWeight: 800, margin: "0 0 1rem", textAlign: "center" }}>Split</h2>

          {/* Top 3-tabs header matching iLovePDF */}
          <div className="split-mode-tabs three-tabs">
            {/* Range tab */}
            <button
              className={`split-mode-tab ${activeTab === "range" ? "active" : ""}`}
              onClick={() => setActiveTab("range")}
              type="button"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {activeTab === "range" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.95rem" }}>[0-0]</span>
              </div>
              <span>Range</span>
            </button>

            {/* Pages tab */}
            <button
              className={`split-mode-tab ${activeTab === "pages" ? "active" : ""}`}
              onClick={() => setActiveTab("pages")}
              type="button"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {activeTab === "pages" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <span>Pages</span>
            </button>

            {/* Size tab */}
            <button
              className={`split-mode-tab ${activeTab === "size" ? "active" : ""}`}
              onClick={() => setActiveTab("size")}
              type="button"
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {activeTab === "size" && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 16v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1" />
                  <rect x="8" y="2" width="13" height="14" rx="2" />
                </svg>
              </div>
              <span>Size</span>
            </button>
          </div>

          {/* ──────── PAGES MODE CONFIG ──────── */}
          {activeTab === "pages" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Extract mode buttons */}
              <div className="split-submode-row">
                <label style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Extract mode:
                </label>
                <div className="split-submode-tabs">
                  <button
                    type="button"
                    className={`split-submode-btn ${extractMode === "all" ? "active" : ""}`}
                    onClick={handleSelectAllPages}
                  >
                    Extract all pages
                  </button>
                  <button
                    type="button"
                    className={`split-submode-btn ${extractMode === "select" ? "active" : ""}`}
                    onClick={handleCustomSelectMode}
                  >
                    Select pages
                  </button>
                </div>
              </div>

              {/* Pages to extract input */}
              <div className="split-submode-row">
                <label style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Pages to extract:
                </label>
                <input
                  type="text"
                  className="split-text-input"
                  value={pagesInput}
                  onChange={handlePagesInputChange}
                  placeholder="e.g. 1,3,6,8-10"
                />
              </div>

              {/* Merge extracted pages checkbox */}
              <label className="split-merge-check">
                <input
                  type="checkbox"
                  checked={mergeExtracted}
                  onChange={(e) => setMergeExtracted(e.target.checked)}
                />
                <span>Merge extracted pages into one PDF file.</span>
              </label>

              {/* Blue info callout matching iLovePDF */}
              <div className="split-info-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <div>
                  {selectedCount === 0 ? (
                    <span>Please select at least one page from the grid or enter page numbers above.</span>
                  ) : mergeExtracted ? (
                    <span>
                      Selected pages will be converted and merged into <strong>1 PDF</strong> file.
                    </span>
                  ) : (
                    <span>
                      Selected pages will be converted into separate PDF files. <strong>{selectedCount} PDF</strong> will be created.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ──────── RANGE MODE CONFIG ──────── */}
          {activeTab === "range" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="split-submode-row">
                <label style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                  Range mode:
                </label>
                <div className="split-submode-tabs">
                  <button
                    type="button"
                    className={`split-submode-btn ${rangeMode === "custom" ? "active" : ""}`}
                    onClick={() => setRangeMode("custom")}
                  >
                    Custom
                  </button>
                  <button
                    type="button"
                    className={`split-submode-btn ${rangeMode === "fixed" ? "active" : ""}`}
                    onClick={() => setRangeMode("fixed")}
                  >
                    Fixed
                  </button>
                </div>
              </div>

              {rangeMode === "custom" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {ranges.map((r, ri) => {
                    const color = RANGE_COLORS[ri % RANGE_COLORS.length];
                    return (
                      <div key={r.id} className="split-range-row">
                        <div className="split-range-header">
                          <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                              Range {ri + 1}
                            </span>
                          </div>
                          {ranges.length > 1 && (
                            <button
                              type="button"
                              className="split-range-remove"
                              onClick={() => removeRange(r.id)}
                              title="Remove range"
                            >
                              ×
                            </button>
                          )}
                        </div>

                        <div className="split-range-inputs">
                          <div className="split-range-field">
                            <label>from page</label>
                            <div className="split-number-input">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={r.from}
                                placeholder="1"
                                onChange={(e) => updateRange(r.id, "from", e.target.value)}
                                onBlur={() => handleRangeBlur(r.id, "from")}
                              />
                              <div className="split-spinners">
                                <button type="button" onClick={() => adjustRangeStep(r.id, "from", 1)}>▲</button>
                                <button type="button" onClick={() => adjustRangeStep(r.id, "from", -1)}>▼</button>
                              </div>
                            </div>
                          </div>
                          <div className="split-range-field">
                            <label>to</label>
                            <div className="split-number-input">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={r.to}
                                placeholder={String(totalPages || 1)}
                                onChange={(e) => updateRange(r.id, "to", e.target.value)}
                                onBlur={() => handleRangeBlur(r.id, "to")}
                              />
                              <div className="split-spinners">
                                <button type="button" onClick={() => adjustRangeStep(r.id, "to", 1)}>▲</button>
                                <button type="button" onClick={() => adjustRangeStep(r.id, "to", -1)}>▼</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button type="button" className="split-add-range-btn" onClick={addRange}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add Range
                  </button>

                  <label className="split-merge-check">
                    <input
                      type="checkbox"
                      checked={mergeAllRanges}
                      onChange={(e) => setMergeAllRanges(e.target.checked)}
                    />
                    <span>Merge all ranges into one PDF file.</span>
                  </label>
                </div>
              ) : (
                /* Fixed mode: Every N pages */
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div className="split-range-row">
                    <div className="split-range-field">
                      <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                        Split every N pages
                      </label>
                      <div className="split-number-input">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={everyN}
                          placeholder="1"
                          onChange={(e) => setEveryN(e.target.value.replace(/[^0-9]/g, ""))}
                          onBlur={() => setEveryN((prev) => Math.max(1, Math.min(totalPages || 9999, Number(prev) || 1)))}
                        />
                        <div className="split-spinners">
                          <button type="button" onClick={() => setEveryN((n) => Math.min(totalPages || 9999, (Number(n) || 1) + 1))}>▲</button>
                          <button type="button" onClick={() => setEveryN((n) => Math.max(1, (Number(n) || 1) - 1))}>▼</button>
                        </div>
                      </div>
                    </div>
                    {totalPages > 0 && (
                      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.4rem 0 0" }}>
                        → {Math.ceil(totalPages / (Number(everyN) || 1))} output file{Math.ceil(totalPages / (Number(everyN) || 1)) !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ──────── SIZE MODE CONFIG ──────── */}
          {activeTab === "size" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <div>
                  Original file size:{" "}
                  <span style={{ fontWeight: 600, color: "var(--text-main)" }}>
                    {formatFileSizeExact(file.size)}
                  </span>
                </div>
                <div>
                  Total pages:{" "}
                  <span style={{ fontWeight: 600, color: "var(--text-main)" }}>
                    {totalPages}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                  Maximum size per file:
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  <input
                    type="number"
                    min="1"
                    step={sizeUnit === "MB" ? "0.1" : "1"}
                    value={sizeValue}
                    onChange={(e) => setSizeValue(e.target.value)}
                    className="split-text-input"
                    style={{ flex: 1, padding: "0.55rem 0.75rem", fontWeight: 600, fontSize: "0.95rem" }}
                  />
                  <div className="size-unit-toggle">
                    <button
                      type="button"
                      className={`size-unit-btn ${sizeUnit === "KB" ? "active" : ""}`}
                      onClick={() => handleUnitChange("KB")}
                    >
                      KB
                    </button>
                    <button
                      type="button"
                      className={`size-unit-btn ${sizeUnit === "MB" ? "active" : ""}`}
                      onClick={() => handleUnitChange("MB")}
                    >
                      MB
                    </button>
                  </div>
                </div>
              </div>

              <div className="split-info-box">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span>
                    This PDF will be split into files no larger than <strong>{sizeValue || 0} {sizeUnit}</strong> each.
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    Note: A single page cannot be sliced in half. Any individual page that exceeds this limit on its own will be saved as an atomic 1-page file.
                  </span>
                </div>
              </div>

              <label className="split-merge-check" style={{ alignItems: "center", padding: "0.25rem 0" }}>
                <input
                  type="checkbox"
                  checked={allowCompression}
                  onChange={(e) => setAllowCompression(e.target.checked)}
                />
                <span style={{ fontWeight: 600, color: "var(--text-main)" }}>Allow compression</span>
              </label>
            </div>
          )}

          {/* Errors */}
          {error && (
            <div className="alert-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              {error}
            </div>
          )}

          {/* Progress */}
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
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>{statusMsg}</p>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginTop: "0.25rem" }}>
            {isRunning ? (
              <button
                type="button"
                className="btn-danger-outline"
                onClick={() => { cancel?.(); }}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="split-run-btn"
                onClick={run}
                disabled={
                  !totalPages ||
                  (activeTab === "pages" && selectedCount === 0) ||
                  (activeTab === "size" && (!sizeValue || Number(sizeValue) <= 0))
                }
              >
                Split PDF
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 8 16 12 12 16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </button>
            )}

            <button type="button" className="btn-secondary" onClick={reset}>
              Choose different file
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
