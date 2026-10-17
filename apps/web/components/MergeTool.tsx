"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { renderPdfPage, getPdfInfo } from "../lib/pdfjs";
import { runTool } from "../lib/runTool";
import PdfZoomModal from "./PdfZoomModal";
import type { OutputFile } from "@pdfkit/core";

/* ── Helpers ─────────────────────────────────────────────────── */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/* ── Left Panel: Document Thumbnail Card ─────────────────────── */
function MergeDocumentCard({
  file,
  index,
  numPages,
  isDragging,
  isDropTarget,
  disabled,
  isRotating,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  onZoom,
  onRotate,
  onRemove,
}: {
  readonly file: File;
  readonly index: number;
  readonly numPages: number | null;
  readonly isDragging: boolean;
  readonly isDropTarget: boolean;
  readonly disabled?: boolean;
  readonly isRotating?: boolean;
  readonly onDragStart: (e: React.DragEvent, index: number) => void;
  readonly onDragOver: (e: React.DragEvent, index: number) => void;
  readonly onDragEnter: (e: React.DragEvent, index: number) => void;
  readonly onDragLeave: (e: React.DragEvent, index: number) => void;
  readonly onDrop: (e: React.DragEvent, index: number) => void;
  readonly onDragEnd: () => void;
  readonly onZoom: (file: File, index: number) => void;
  readonly onRotate: (index: number) => void;
  readonly onRemove: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    if (canvasRef.current) {
      void renderPdfPage(file, canvasRef.current, 1, 320)
        .then(() => {
          if (active) setLoading(false);
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [file]);

  return (
    <div
      className={`pdf-thumb-card ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
      draggable={!disabled && !isRotating}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnter={(e) => onDragEnter(e, index)}
      onDragLeave={(e) => onDragLeave(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      title="Drag to reorder sequence"
    >
      {/* Top Header Row of Card */}
      <div className="pdf-thumb-card-header">
        <span className="pdf-thumb-order-badge" title={`Order sequence: #${index + 1}`}>
          {index + 1}
        </span>
        <div className="pdf-thumb-card-tools">
          {/* Rotate Button */}
          <button
            type="button"
            className={`pdf-thumb-action-btn rotate-btn ${isRotating ? "rotating" : ""}`}
            disabled={disabled || isRotating}
            onClick={(e) => {
              e.stopPropagation();
              onRotate(index);
            }}
            title="Rotate 90° clockwise"
            aria-label="Rotate PDF"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6" />
              <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>

          {/* Zoom Preview Button */}
          <button
            type="button"
            className="pdf-thumb-action-btn zoom-btn"
            onClick={(e) => {
              e.stopPropagation();
              onZoom(file, index);
            }}
            title="Zoom in / Preview document"
            aria-label="Zoom in"
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>

          {/* Remove Button */}
          <button
            type="button"
            className="pdf-thumb-action-btn delete-btn"
            disabled={disabled || isRotating}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(index);
            }}
            title="Remove from merge list"
            aria-label="Remove"
          >
            &times;
          </button>
        </div>
      </div>

      {/* PDF Document Sheet Preview */}
      <div className="pdf-thumb-sheet-wrapper">
        <div className="pdf-thumb-sheet">
          {(loading || isRotating) && (
            <div className="pdf-thumb-skeleton">
              <div className="pdf-thumb-spinner" />
            </div>
          )}
          <canvas ref={canvasRef} className="pdf-thumb-canvas" />
        </div>
      </div>

      {/* File Meta Info */}
      <div className="pdf-thumb-footer">
        <span className="pdf-thumb-filename" title={file.name}>
          {file.name}
        </span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: "0.25rem" }}>
          <span className="pdf-thumb-pages-count">
            {numPages !== null ? `${numPages} ${numPages === 1 ? "page" : "pages"}` : "1 page"}
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {formatBytes(file.size)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Results View ────────────────────────────────────────────── */
function MergeResultsView({
  results,
  onReset,
}: {
  readonly results: readonly { readonly name: string; readonly url: string; readonly size: number }[];
  readonly onReset: () => void;
}) {
  const resultFile = results[0];
  if (!resultFile) return null;

  return (
    <div className="tool-runner-panel" style={{ maxWidth: 860, margin: "0 auto" }}>
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1.5px solid var(--border-light)",
          borderRadius: "var(--radius-lg)",
          padding: "2.5rem 2rem",
          boxShadow: "var(--shadow-md)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--success-subtle)",
            border: "1.5px solid var(--success-border)",
            color: "var(--success)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}
        >
          <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>

        <h2 style={{ fontSize: "1.625rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.5rem" }}>
          PDFs Merged Successfully!
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", marginBottom: "2rem" }}>
          Your combined PDF document is ready for download.
        </p>

        <div
          style={{
            maxWidth: 500,
            margin: "0 auto 2.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", overflow: "hidden" }}>
            <div style={{ color: "var(--primary)", flexShrink: 0 }}>
              <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="2" width="13" height="15" rx="2" />
                <path d="M4 8v12a2 2 0 0 0 2 2h12" />
              </svg>
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontWeight: 700, color: "var(--text-main)", textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", fontSize: "0.9375rem" }}>
                {resultFile.name}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                {formatBytes(resultFile.size)}
              </div>
            </div>
          </div>

          <a
            href={resultFile.url}
            download={resultFile.name}
            className="btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.6rem 1.25rem",
              fontSize: "0.9375rem",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download</span>
          </a>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="btn-secondary"
          style={{ padding: "0.65rem 1.75rem" }}
        >
          Merge More Files
        </button>
      </div>
    </div>
  );
}

/* ── Right Panel: Controls & Sequence Manager ────────────────── */
function MergeRightPanel({
  files,
  filePagesMap,
  totalPagesAllFiles,
  outputFileName,
  setOutputFileName,
  isRunning,
  progress,
  statusMessage,
  cancel,
  error,
  onMoveUp,
  onMoveDown,
  onRemove,
  onSortAlpha,
  onReverse,
  onMergeSubmit,
}: {
  readonly files: readonly File[];
  readonly filePagesMap: Readonly<Record<string, number>>;
  readonly totalPagesAllFiles: number;
  readonly outputFileName: string;
  readonly setOutputFileName: (name: string) => void;
  readonly isRunning: boolean;
  readonly progress: number | null;
  readonly statusMessage: string;
  readonly cancel: (() => void) | null;
  readonly error: string;
  readonly onMoveUp: (index: number) => void;
  readonly onMoveDown: (index: number) => void;
  readonly onRemove: (index: number) => void;
  readonly onSortAlpha: () => void;
  readonly onReverse: () => void;
  readonly onMergeSubmit: () => void;
}) {
  const canMerge = files.length >= 2;

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1.5px solid var(--border-light)",
        borderRadius: "var(--radius-lg)",
        padding: "1.5rem",
        boxShadow: "var(--shadow-sm)",
        position: "sticky",
        top: "5.5rem",
        maxHeight: "calc(100vh - 7rem)",
        overflowY: "auto",
        minWidth: 0,
        boxSizing: "border-box",
        zIndex: 10,
      }}
    >
      {/* Panel Header */}
      <div style={{ marginBottom: "1.25rem", paddingBottom: "0.875rem", borderBottom: "1.5px solid var(--border-light)" }}>
        <h3 style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)", margin: "0 0 0.25rem 0" }}>
          Merge Settings
        </h3>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
          Files will be combined in the exact sequence shown below.
        </p>
      </div>

      {/* Sequence List Header & Quick Sort Tools */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)" }}>
          Sequence ({files.length} {files.length === 1 ? "file" : "files"})
        </span>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <button
            type="button"
            onClick={onSortAlpha}
            title="Sort alphabetically (A-Z)"
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-light)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            A-Z
          </button>
          <button
            type="button"
            onClick={onReverse}
            title="Reverse sequence order"
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-light)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            Reverse
          </button>
        </div>
      </div>

      {/* Sequence List */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.45rem",
          maxHeight: "220px",
          overflowY: "auto",
          paddingRight: "0.25rem",
          marginBottom: "1.25rem",
        }}
      >
        {files.map((file, idx) => {
          const numPages = filePagesMap[file.name] || 1;
          return (
            <div
              key={`${file.name}-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.45rem 0.65rem",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8125rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1, marginRight: "0.5rem" }}>
                <span
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: "var(--primary-subtle)",
                    color: "var(--primary)",
                    fontSize: "0.6875rem",
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                    color: "var(--text-main)",
                  }}
                  title={file.name}
                >
                  {file.name}
                </span>
                <span
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--text-muted)",
                    background: "var(--bg-surface)",
                    padding: "0.1rem 0.35rem",
                    borderRadius: "4px",
                    border: "1px solid var(--border-light)",
                    flexShrink: 0,
                  }}
                >
                  {numPages}p
                </span>
              </div>

              {/* Move Up, Down, Remove buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", flexShrink: 0 }}>
                <button
                  type="button"
                  disabled={idx === 0 || isRunning}
                  onClick={() => onMoveUp(idx)}
                  title="Move Up"
                  aria-label={`Move ${file.name} up`}
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "4px",
                    border: "1px solid var(--border-light)",
                    background: "#ffffff",
                    color: idx === 0 ? "var(--text-muted)" : "var(--text-main)",
                    cursor: idx === 0 ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>

                <button
                  type="button"
                  disabled={idx === files.length - 1 || isRunning}
                  onClick={() => onMoveDown(idx)}
                  title="Move Down"
                  aria-label={`Move ${file.name} down`}
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "4px",
                    border: "1px solid var(--border-light)",
                    background: "#ffffff",
                    color: idx === files.length - 1 ? "var(--text-muted)" : "var(--text-main)",
                    cursor: idx === files.length - 1 ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => onRemove(idx)}
                  title="Remove file"
                  aria-label={`Remove ${file.name}`}
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "4px",
                    border: "none",
                    background: "transparent",
                    color: "var(--danger)",
                    cursor: "pointer",
                    fontSize: "1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  &times;
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Output File Name Setting */}
      <div style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="merge-output-name-input" style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.35rem" }}>
          Output File Name:
        </label>
        <input
          id="merge-output-name-input"
          type="text"
          value={outputFileName}
          onChange={(e) => setOutputFileName(e.target.value)}
          placeholder="merged.pdf"
          style={{
            width: "100%",
            padding: "0.6rem 0.75rem",
            borderRadius: "var(--radius-md)",
            border: "1.5px solid var(--border-medium)",
            fontSize: "0.875rem",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Summary Card */}
      <div
        style={{
          background: "var(--bg-subtle)",
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-md)",
          padding: "0.875rem",
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
          <span>Total Documents:</span>
          <strong style={{ color: "var(--text-main)" }}>{files.length} PDFs</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
          <span>Combined Pages:</span>
          <strong style={{ color: "var(--text-main)" }}>{totalPagesAllFiles} Pages</strong>
        </div>
      </div>

      {/* Action / Submit Area */}
      <div>
        {!canMerge && (
          <p style={{ fontSize: "0.75rem", color: "#b45309", background: "#fef3c7", padding: "0.5rem 0.75rem", borderRadius: "6px", marginBottom: "0.75rem" }}>
            Add at least 2 PDF files to enable merging.
          </p>
        )}

        {isRunning ? (
          <div>
            <div
              style={{
                width: "100%",
                height: 8,
                borderRadius: 99,
                background: "var(--border-light)",
                overflow: "hidden",
                marginBottom: "0.6rem",
              }}
            >
              <div
                style={{
                  width: `${Math.round((progress ?? 0) * 100)}%`,
                  height: "100%",
                  background: "var(--primary)",
                  borderRadius: 99,
                  transition: "width 0.2s ease",
                }}
              />
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", textAlign: "center", marginBottom: "0.75rem" }}>
              {statusMessage || `Merging... ${Math.round((progress ?? 0) * 100)}%`}
            </p>
            {cancel && (
              <button
                type="button"
                onClick={cancel}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--danger-border)",
                  background: "var(--danger-subtle)",
                  color: "var(--danger)",
                  fontWeight: 700,
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={!canMerge}
            onClick={onMergeSubmit}
            className="btn-primary"
            style={{
              width: "100%",
              padding: "0.875rem 1rem",
              fontSize: "1.0625rem",
              fontWeight: 800,
              borderRadius: "var(--radius-md)",
              boxShadow: canMerge ? "var(--shadow-md)" : "none",
              cursor: canMerge ? "pointer" : "not-allowed",
              opacity: canMerge ? 1 : 0.6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <span>Merge PDFs</span>
          </button>
        )}

        {error && (
          <div className="alert-error" style={{ marginTop: "1rem" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main MergeTool Component ───────────────────────────────── */
export default function MergeTool() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Files State */
  const [files, setFiles] = useState<File[]>([]);
  const [filePagesMap, setFilePagesMap] = useState<Record<string, number>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [outputFileName, setOutputFileName] = useState("merged.pdf");

  /* Drag & Drop Reorder states */
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  /* Rotating state */
  const [rotatingIdx, setRotatingIdx] = useState<number | null>(null);

  /* Zoom modal state */
  const [zoomTarget, setZoomTarget] = useState<{ file: File; index: number } | null>(null);

  /* Execution state */
  const [progress, setProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<{ name: string; url: string; size: number }[]>([]);
  const [cancel, setCancel] = useState<(() => void) | null>(null);
  const isRunning = progress !== null;

  /* Cleanup object URLs on unmount */
  useEffect(() => {
    return () => {
      results.forEach((r) => URL.revokeObjectURL(r.url));
    };
  }, [results]);

  /* Total pages across all loaded files */
  const totalPagesAllFiles = useMemo(() => {
    return files.reduce((acc, f) => acc + (filePagesMap[f.name] || 0), 0);
  }, [files, filePagesMap]);

  /* ── Load Files ──────────────────────────────────────────── */
  async function handleFileSelect(selectedFiles: FileList | File[] | null, append = true) {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const arr = Array.from(selectedFiles).filter((f) => f.name.toLowerCase().endsWith(".pdf"));

    if (arr.length === 0) {
      setError("Please select valid PDF files.");
      return;
    }

    setError("");
    setResults([]);
    setProgress(null);

    const updatedFiles = append
      ? [...files, ...arr.filter((af) => !files.some((ef) => ef.name === af.name))]
      : arr;

    setFiles(updatedFiles);

    // Fetch page counts for all files in parallel
    const missingFiles = arr.filter((f) => !filePagesMap[f.name]);
    if (missingFiles.length > 0) {
      const infos = await Promise.all(missingFiles.map((f) => getPdfInfo(f)));
      const newPagesMap = { ...filePagesMap };
      missingFiles.forEach((f, idx) => {
        newPagesMap[f.name] = infos[idx]?.numPages ?? 1;
      });
      setFilePagesMap(newPagesMap);
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function moveFile(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= files.length) return;
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function moveUp(index: number) {
    moveFile(index, index - 1);
  }

  function moveDown(index: number) {
    moveFile(index, index + 1);
  }

  function handleSortAlphabetical() {
    setFiles((prev) => [...prev].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function handleReverseOrder() {
    setFiles((prev) => [...prev].reverse());
  }

  function clearAllFiles() {
    setFiles([]);
    setFilePagesMap({});
    setResults([]);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /* ── Single Document Rotation (90° clockwise) ───────────── */
  async function handleRotateFile(index: number, deg = 90) {
    const file = files[index];
    if (!file || rotatingIdx !== null) return;
    setRotatingIdx(index);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const job = runTool("rotate", [{ name: file.name, data }], { degrees: deg }, () => {});
      const [out] = await job.promise;
      const rotatedFile = new File([out.data as BlobPart], file.name, { type: file.type || "application/pdf" });

      setFiles((prev) => {
        const next = [...prev];
        next[index] = rotatedFile;
        return next;
      });

      if (zoomTarget?.index === index) {
        setZoomTarget({ file: rotatedFile, index });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Failed to rotate file:", err);
      setError("Failed to rotate document: " + msg);
    } finally {
      setRotatingIdx(null);
    }
  }

  /* ── Drag and Drop Reordering Handlers ────────────────────── */
  function handleCardDragStart(e: React.DragEvent, index: number) {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${index}`);
  }

  function handleCardDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx !== index) {
      setDragOverIdx(index);
    }
  }

  function handleCardDragEnter(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIdx(index);
  }

  function handleCardDragLeave() {
    // leave
  }

  function handleCardDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    if (draggedIdx === null) return;
    if (draggedIdx !== dropIndex) {
      moveFile(draggedIdx, dropIndex);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  }

  function handleCardDragEnd() {
    setDraggedIdx(null);
    setDragOverIdx(null);
  }

  /* ── Process & Run Merge ─────────────────────────────────── */
  async function handleMergeSubmit() {
    if (files.length < 2 || isRunning) return;
    setError("");
    setProgress(0);
    setStatusMessage("Preparing files for merging...");

    try {
      const inputs = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          data: new Uint8Array(await f.arrayBuffer()),
        }))
      );

      setStatusMessage(`Merging ${files.length} PDFs...`);

      const job = runTool("merge", inputs, {}, (p) => {
        setProgress(p);
        setStatusMessage(`Merging documents... ${Math.round(p * 100)}%`);
      });

      setCancel(() => job.cancel);
      const outputs: OutputFile[] = await job.promise;

      const trimmedName = outputFileName.trim();
      const finalName = trimmedName
        ? (trimmedName.toLowerCase().endsWith(".pdf") ? trimmedName : `${trimmedName}.pdf`)
        : "merged.pdf";

      const res = outputs.map((out) => {
        const blob = new Blob([out.data as BlobPart], { type: out.mime || "application/pdf" });
        return {
          name: finalName,
          url: URL.createObjectURL(blob),
          size: out.data.byteLength,
        };
      });

      setResults(res);
      setProgress(null);
      setStatusMessage("");
      setCancel(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred during merging.";
      console.error("Merge error:", err);
      setError(msg);
      setProgress(null);
      setStatusMessage("");
      setCancel(null);
    }
  }

  /* ── Dropzone Handlers ───────────────────────────────────── */
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        void handleFileSelect(e.dataTransfer.files, files.length > 0);
      }
    },
    [files.length]
  );

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

  /* ── RENDER: Results View ────────────────────────────────── */
  if (results.length > 0) {
    return (
      <MergeResultsView
        results={results}
        onReset={clearAllFiles}
      />
    );
  }

  /* ── RENDER: Initial Empty State ─────────────────────────── */
  if (files.length === 0) {
    return (
      <div className="tool-runner-panel" style={{ maxWidth: 860, margin: "0 auto" }}>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          accept="application/pdf"
          onChange={(e) => {
            void handleFileSelect(e.target.files, false);
            e.target.value = "";
          }}
        />

        <div className="dropzone-container">
          <div
            className={`dropzone ${isDragging ? "active" : ""}`}
            role="button"
            tabIndex={0}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <svg aria-hidden="true" className="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>

            <p className="dropzone-text-primary">
              Choose PDF files, or drag and drop here
            </p>
            <span className="dropzone-badge">
              Multiple files (.pdf)
            </span>
          </div>
        </div>

        {error && (
          <div className="alert-error" style={{ marginTop: "1rem" }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  /* ── RENDER: Active 2-Column Workspace ───────────────────── */
  return (
    <div style={{ width: "100%", maxWidth: "100%", margin: "0 auto", paddingBottom: "3rem", overflowX: "clip", boxSizing: "border-box" }}>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept="application/pdf"
        onChange={(e) => {
          void handleFileSelect(e.target.files, true);
          e.target.value = "";
        }}
      />

      {/* Top Upload Banner */}
      <div className="dropzone-container" style={{ marginBottom: "1.25rem" }}>
        <div
          className={`dropzone ${isDragging ? "active" : ""}`}
          role="button"
          tabIndex={0}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          style={{ padding: "1.25rem", minHeight: "auto" }}
        >
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--primary)" }}
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="dropzone-text-primary" style={{ margin: 0, fontSize: "0.9375rem" }}>
            Click or drop more files to add
          </p>
          <span className="dropzone-badge" style={{ margin: 0 }}>
            {files.length} {files.length === 1 ? "PDF" : "PDFs"} selected ({totalPagesAllFiles} pages total)
          </span>
        </div>
      </div>

      {/* 2-Column Interface: Left = Files Preview Grid, Right = Merge Sequence & Controls */}
      <div
        className="merge-workspace-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: "1.5rem",
          alignItems: "start",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* LEFT PANEL: Preview grid of all documents */}
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1.5px solid var(--border-light)",
            borderRadius: "var(--radius-lg)",
            padding: "1.5rem",
            boxShadow: "var(--shadow-sm)",
            minHeight: "560px",
            minWidth: 0,
            overflowX: "hidden",
            boxSizing: "border-box",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1.5px solid var(--border-light)",
              paddingBottom: "0.875rem",
              marginBottom: "1.5rem",
            }}
          >
            <div>
              <h2 style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
                Files to Merge ({files.length})
              </h2>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0.2rem 0 0 0" }}>
                Drag cards to reorder the sequence. You can also rotate or preview each document.
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={clearAllFiles}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--danger)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="pdf-thumbs-grid">
            {files.map((file, idx) => (
              <MergeDocumentCard
                key={`${file.name}-${idx}`}
                file={file}
                index={idx}
                numPages={filePagesMap[file.name] ?? null}
                isDragging={draggedIdx === idx}
                isDropTarget={dragOverIdx === idx && draggedIdx !== idx}
                disabled={isRunning}
                isRotating={rotatingIdx === idx}
                onDragStart={handleCardDragStart}
                onDragOver={handleCardDragOver}
                onDragEnter={handleCardDragEnter}
                onDragLeave={handleCardDragLeave}
                onDrop={handleCardDrop}
                onDragEnd={handleCardDragEnd}
                onZoom={(f, i) => setZoomTarget({ file: f, index: i })}
                onRotate={(i) => { void handleRotateFile(i, 90); }}
                onRemove={removeFile}
              />
            ))}
          </div>
        </div>

        {/* RIGHT PANEL: Sequence Manager, Options, and Merge Action */}
        <MergeRightPanel
          files={files}
          filePagesMap={filePagesMap}
          totalPagesAllFiles={totalPagesAllFiles}
          outputFileName={outputFileName}
          setOutputFileName={setOutputFileName}
          isRunning={isRunning}
          progress={progress}
          statusMessage={statusMessage}
          cancel={cancel}
          error={error}
          onMoveUp={moveUp}
          onMoveDown={moveDown}
          onRemove={removeFile}
          onSortAlpha={handleSortAlphabetical}
          onReverse={handleReverseOrder}
          onMergeSubmit={() => { void handleMergeSubmit(); }}
        />
      </div>

      {/* High-Resolution Zoom Lightbox */}
      {zoomTarget && (
        <PdfZoomModal
          file={zoomTarget.file}
          pageNum={1}
          showAngle={false}
          onRotateLeft={() => { void handleRotateFile(zoomTarget.index, 270); }}
          onRotateRight={() => { void handleRotateFile(zoomTarget.index, 90); }}
          onClose={() => setZoomTarget(null)}
        />
      )}
    </div>
  );
}
