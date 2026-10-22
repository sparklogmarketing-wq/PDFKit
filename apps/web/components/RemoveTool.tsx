"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { renderPdfPage, getPdfInfo } from "../lib/pdfjs";
import { usePdfThumbnail } from "../lib/usePdfThumbnail";
import { runTool, isCancelledError } from "../lib/runTool";
import { formatBytes, formatPagesToRangeString } from "../lib/format";
import { parsePageSpec } from "@pdfkit/core";
import PdfZoomModal from "./PdfZoomModal";
import ToolResultsView from "./ToolResultsView";
import ToolProgressBar from "./ToolProgressBar";
import ToolWorkspaceShell from "./ToolWorkspaceShell";
import ToolPanelHeader from "./ToolPanelHeader";

/* ── Remove Page Thumbnail Card ─────────────────────────────── */
function RemovePageThumbnailCard({
  file,
  pageNum,
  isDeleted,
  onToggleDelete,
  onZoom,
}: {
  readonly file: File;
  readonly pageNum: number;
  readonly isDeleted: boolean;
  readonly onToggleDelete: (page: number) => void;
  readonly onZoom: (page: number) => void;
}) {
  const { canvasRef, containerRef, loading } = usePdfThumbnail({
    file,
    pageNum,
    targetWidth: 280,
    rootMargin: "300px 0px",
  });

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      onClick={() => onToggleDelete(pageNum)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleDelete(pageNum);
        }
      }}
      className={`remove-page-card ${isDeleted ? "is-deleted" : ""}`}
      aria-label={`Page ${pageNum}, ${isDeleted ? "marked to delete" : "kept"}`}
    >
      {/* Top action toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
          padding: "0 0.1rem",
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 800,
            borderRadius: "9999px",
            padding: "0.15rem 0.5rem",
            background: isDeleted ? "#fee2e2" : "var(--bg-muted)",
            color: isDeleted ? "#dc2626" : "var(--text-secondary)",
          }}
        >
          Page {pageNum}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          {/* Zoom button */}
          <button
            type="button"
            title={`Zoom page ${pageNum}`}
            aria-label={`Zoom preview of page ${pageNum}`}
            onClick={(e) => {
              e.stopPropagation();
              onZoom(pageNum);
            }}
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              border: "1px solid var(--border-light)",
              background: "#ffffff",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas preview */}
      <div className="remove-page-canvas-wrapper">
        {loading && (
          <div style={{ position: "absolute", color: "var(--text-muted)", fontSize: "0.75rem" }}>
            Loading...
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            display: "block",
            opacity: isDeleted ? 0.45 : 1,
            transition: "opacity 0.2s ease",
          }}
        />

        {/* Deleted overlay banner */}
        {isDeleted && (
          <div className="remove-page-deleted-overlay">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span>Delete</span>
          </div>
        )}
      </div>

      {/* Bottom indicator badge */}
      <div style={{ marginTop: "0.5rem", textAlign: "center" }}>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            color: isDeleted ? "#dc2626" : "var(--text-secondary)",
          }}
        >
          {isDeleted ? "Marked to delete" : "Click to delete"}
        </span>
      </div>
    </div>
  );
}

/* ── Final Confirmation Delete Modal Popup ─────────────────── */
function FinalDeleteConfirmModal({
  fileName,
  deleteCount,
  totalCount,
  deletedRangeString,
  onConfirm,
  onCancel,
}: {
  readonly fileName: string;
  readonly deleteCount: number;
  readonly totalCount: number;
  readonly deletedRangeString: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const remainingCount = totalCount - deleteCount;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="confirm-modal-backdrop">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onCancel}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "default",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="confirm-modal-box"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* Modal Header */}
        <div className="confirm-modal-header">
          <div className="confirm-modal-icon-danger">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div>
            <h3 id="confirm-modal-title" style={{ margin: 0, fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)" }}>
              Confirm Page Deletion
            </h3>
            <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              Please review the pages you are removing.
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div className="confirm-modal-body">
          <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--text-main)", lineHeight: 1.5 }}>
            You are about to delete <strong>{deleteCount} {deleteCount === 1 ? "page" : "pages"}</strong> from <strong>{fileName}</strong>.
          </p>

          <div
            style={{
              background: "#fff5f5",
              border: "1.5px solid #fecaca",
              borderRadius: "var(--radius-md)",
              padding: "0.875rem 1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>Pages to delete:</span>
              <strong style={{ color: "#dc2626" }}>{deletedRangeString || `Count: ${deleteCount}`}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>Pages remaining:</span>
              <strong style={{ color: "#059669" }}>{remainingCount} {remainingCount === 1 ? "page" : "pages"}</strong>
            </div>
          </div>

          <div
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
              background: "var(--bg-subtle)",
              padding: "0.75rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-light)",
            }}
          >
            Your original document will not be modified. A new PDF with the remaining pages will be downloaded.
          </div>
        </div>

        {/* Modal Footer */}
        <div className="confirm-modal-footer">
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "0.6rem 1.1rem",
              fontSize: "0.875rem",
              fontWeight: 700,
              borderRadius: "var(--radius-md)",
              border: "1.5px solid var(--border-medium)",
              background: "#ffffff",
              color: "var(--text-main)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "0.6rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 800,
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "#dc2626",
              color: "#ffffff",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(220, 38, 38, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Yes, Delete Pages</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Remove Right Panel Controls ───────────────────────────── */
function RemoveRightPanel({
  fileName,
  fileSize,
  numPages,
  deletedCount,
  rangeInput,
  onRangeInputChange,
  onClearSelection,
  outputFileName,
  setOutputFileName,
  isRunning,
  progress,
  statusMessage,
  cancel,
  error,
  onOpenConfirmModal,
}: {
  readonly fileName: string;
  readonly fileSize: number;
  readonly numPages: number;
  readonly deletedCount: number;
  readonly rangeInput: string;
  readonly onRangeInputChange: (val: string) => void;
  readonly onClearSelection: () => void;
  readonly outputFileName: string;
  readonly setOutputFileName: (val: string) => void;
  readonly isRunning: boolean;
  readonly progress: number | null;
  readonly statusMessage: string;
  readonly cancel: (() => void) | null;
  readonly error: string;
  readonly onOpenConfirmModal: () => void;
}) {
  const remainingCount = numPages - deletedCount;
  const canDelete = deletedCount > 0 && remainingCount > 0;

  return (
    <div className="tool-sticky-panel">
      {/* Document info */}
      <div
        style={{
          borderBottom: "1.5px solid var(--border-light)",
          paddingBottom: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <h3 style={{ fontSize: "1.0625rem", fontWeight: 800, margin: "0 0 0.35rem 0", color: "var(--text-main)" }}>
          Remove Pages Settings
        </h3>
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
          {fileName} ({formatBytes(fileSize)})
        </p>
      </div>

      {/* Pages Metric Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "0.5rem",
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ background: "var(--bg-subtle)", padding: "0.6rem", borderRadius: "var(--radius-md)", textAlign: "center", border: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>Total</div>
          <div style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)" }}>{numPages}</div>
        </div>

        <div style={{ background: "#fff5f5", padding: "0.6rem", borderRadius: "var(--radius-md)", textAlign: "center", border: "1px solid #fecaca" }}>
          <div style={{ fontSize: "0.75rem", color: "#dc2626", fontWeight: 600 }}>To Delete</div>
          <div style={{ fontSize: "1.125rem", fontWeight: 800, color: "#dc2626" }}>{deletedCount}</div>
        </div>

        <div style={{ background: "#f0fdf4", padding: "0.6rem", borderRadius: "var(--radius-md)", textAlign: "center", border: "1px solid #bbf7d0" }}>
          <div style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 600 }}>To Keep</div>
          <div style={{ fontSize: "1.125rem", fontWeight: 800, color: "#16a34a" }}>{remainingCount}</div>
        </div>
      </div>

      {/* Pages / Range input field */}
      <div style={{ marginBottom: "1.25rem" }}>
        <label
          htmlFor="range-delete-input"
          style={{ display: "block", fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.4rem" }}
        >
          Type Pages or Range to Delete:
        </label>
        <input
          id="range-delete-input"
          type="text"
          value={rangeInput}
          onChange={(e) => onRangeInputChange(e.target.value)}
          placeholder="e.g. 1, 3-5, 8"
          disabled={isRunning}
          style={{
            width: "100%",
            padding: "0.65rem 0.875rem",
            border: "1.5px solid var(--border-medium)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.9375rem",
            fontWeight: 600,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0.35rem 0 0 0" }}>
          Enter individual pages or ranges separated by commas (e.g. 1, 3-5).
        </p>

        {/* Quick action button */}
        {deletedCount > 0 && (
          <div style={{ marginTop: "0.65rem" }}>
            <button
              type="button"
              onClick={onClearSelection}
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                padding: "0.25rem 0.5rem",
                borderRadius: "4px",
                border: "1px solid var(--border-light)",
                background: "#ffffff",
                color: "#dc2626",
                cursor: "pointer",
              }}
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>

      {/* Output file name */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label
          htmlFor="output-file-name"
          style={{ display: "block", fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.4rem" }}
        >
          Save Output As:
        </label>
        <input
          id="output-file-name"
          type="text"
          value={outputFileName}
          onChange={(e) => setOutputFileName(e.target.value)}
          disabled={isRunning}
          style={{
            width: "100%",
            padding: "0.65rem 0.875rem",
            border: "1.5px solid var(--border-medium)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.875rem",
            fontWeight: 600,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Action / Submit Button */}
      {isRunning ? (
        <ToolProgressBar
          progress={progress}
          statusMsg={statusMessage || "Removing pages from PDF..."}
          onCancel={cancel}
        />
      ) : (
        <div>
          <button
            type="button"
            disabled={!canDelete}
            onClick={onOpenConfirmModal}
            className="tool-action-btn"
            style={{
              background: canDelete ? "#dc2626" : "var(--bg-muted)",
              color: canDelete ? "#ffffff" : "var(--text-muted)",
              boxShadow: canDelete ? "0 4px 14px rgba(220, 38, 38, 0.35)" : "none",
            }}
          >
            <span>Remove Pages</span>
          </button>

          {!canDelete && remainingCount === 0 && deletedCount > 0 && (
            <p style={{ fontSize: "0.75rem", color: "#dc2626", textAlign: "center", margin: "0.5rem 0 0 0" }}>
              At least 1 page must remain in the document.
            </p>
          )}
        </div>
      )}

      {error ? (
        <div className="alert-error" role="alert" style={{ marginTop: "1rem" }}>
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}

/* ── Main RemoveTool Component ──────────────────────────────── */
export default function RemoveTool() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Files State */
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [deletedPages, setDeletedPages] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState<string>("");
  const [outputFileName, setOutputFileName] = useState<string>("document-removed.pdf");

  /* Zoom modal state */
  const [zoomTarget, setZoomTarget] = useState<number | null>(null);

  /* Confirmation Popup Modal state */
  const [confirmModalOpen, setConfirmModalOpen] = useState<boolean>(false);

  /* Run & Execution State */
  const [progress, setProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [results, setResults] = useState<{ name: string; url: string; size: number }[]>([]);
  const [cancel, setCancel] = useState<(() => void) | null>(null);
  const isRunning = progress !== null;

  const cancelRef = useRef<(() => void) | null>(null);
  cancelRef.current = cancel;

  /* Cleanup object URLs and cancel running worker on unmount */
  useEffect(() => {
    return () => {
      cancelRef.current?.();
      for (const res of results) {
        URL.revokeObjectURL(res.url);
      }
    };
  }, [results]);

  /* ── Load File ───────────────────────────────────────────── */
  const handleFileSelect = useCallback(async (selectedFiles: FileList | File[] | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const pdfs = Array.from(selectedFiles).filter((f) => f.name.toLowerCase().endsWith(".pdf"));

    if (pdfs.length === 0) {
      setError("Please select a valid PDF file.");
      return;
    }

    const selectedFile = pdfs[0];
    setError("");
    setResults([]);
    setProgress(null);
    setDeletedPages(new Set());
    setRangeInput("");

    const base = selectedFile.name.replace(/\.pdf$/i, "");
    setOutputFileName(`${base}-removed.pdf`);
    setFile(selectedFile);

    const info = await getPdfInfo(selectedFile);
    const pagesCount = info?.numPages || 1;
    setNumPages(pagesCount);
  }, []);

  function clearAllFiles() {
    setFile(null);
    setNumPages(0);
    setDeletedPages(new Set());
    setRangeInput("");
    setResults([]);
    setError("");
    setConfirmModalOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /* ── Toggle Page Deletion ────────────────────────────────── */
  const togglePageDelete = useCallback(
    (pageNum: number) => {
      const idx = pageNum - 1;
      setDeletedPages((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) {
          next.delete(idx);
        } else {
          next.add(idx);
        }
        const rangeStr = formatPagesToRangeString(Array.from(next));
        setRangeInput(rangeStr);
        return next;
      });
      setError("");
    },
    []
  );

  /* ── Handle Manual Range Typing ──────────────────────────── */
  const handleRangeInputChange = useCallback(
    (inputVal: string) => {
      setRangeInput(inputVal);
      setError("");

      if (!inputVal.trim()) {
        setDeletedPages(new Set());
        return;
      }

      try {
        const parsed = parsePageSpec(inputVal, numPages);
        setDeletedPages(new Set(parsed));
      } catch {
        // While user is typing intermediate states (e.g. "1-"), do not crash
      }
    },
    [numPages]
  );

  /* ── Selection Action ────────────────────────────────────── */
  const handleClearSelection = useCallback(() => {
    setDeletedPages(new Set());
    setRangeInput("");
    setError("");
  }, []);

  /* ── Run Tool Execution ──────────────────────────────────── */
  async function handleRemoveSubmit() {
    if (!file || deletedPages.size === 0) return;
    setConfirmModalOpen(false);

    if (deletedPages.size >= numPages) {
      setError("Cannot remove all pages from the PDF. At least one page must remain.");
      return;
    }

    setError("");
    setProgress(0.05);
    setStatusMessage("Preparing document...");

    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const inputs = [{ name: file.name, data }];

      const job = runTool(
        "remove",
        inputs,
        {
          pageIndices: Array.from(deletedPages).sort((a, b) => a - b),
          outputFileName,
        },
        (p: number) => {
          setProgress(p);
          setStatusMessage(`Removing pages... ${Math.round(p * 100)}%`);
        }
      );

      setCancel(() => job.cancel);
      const outputs = await job.promise;

      const items = outputs.map((item) => {
        const blob = new Blob([item.data as BlobPart], { type: item.mime || "application/pdf" });
        return {
          name: item.name,
          url: URL.createObjectURL(blob),
          size: item.data.byteLength,
        };
      });

      setResults(items);
    } catch (err: unknown) {
      if (!isCancelledError(err)) {
        const msg = err instanceof Error ? err.message : "An error occurred while removing pages.";
        console.error("Remove pages error:", err);
        setError(msg);
      }
    } finally {
      setProgress(null);
      setStatusMessage("");
      setCancel(null);
    }
  }

  /* ── RENDER: Results View ────────────────────────────────── */
  if (results.length > 0) {
    return (
      <ToolResultsView
        title="Pages Removed Successfully!"
        subtitle={`Your document is ready with ${deletedPages.size} ${deletedPages.size === 1 ? "page" : "pages"} removed.`}
        results={results}
        resetLabel="Remove More Pages"
        onReset={clearAllFiles}
      />
    );
  }

  /* ── RENDER: Main Workspace ──────────────────────────────── */
  const pageList = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <ToolWorkspaceShell
      error={error}
      fileInputRef={fileInputRef}
      filesCount={file ? 1 : 0}
      totalPages={numPages}
      allowMultiple={false}
      onFilesSelected={handleFileSelect}
    >
      {file && (
        <div className="remove-workspace-layout">
          {/* LEFT PANEL: Interactive Page Cards Grid */}
          <div className="tool-left-panel">
            <ToolPanelHeader
              title={`Pages in Document (${numPages})`}
              description="Click any page to mark for deletion. Click again to restore."
              clearLabel="Remove PDF"
              onClear={clearAllFiles}
            />

            <div className="remove-pages-grid">
              {pageList.map((pageNum) => (
                <RemovePageThumbnailCard
                  key={`page-${pageNum}`}
                  file={file}
                  pageNum={pageNum}
                  isDeleted={deletedPages.has(pageNum - 1)}
                  onToggleDelete={togglePageDelete}
                  onZoom={(p) => setZoomTarget(p)}
                />
              ))}
            </div>
          </div>

          {/* RIGHT PANEL: Controls, Range Input, and Action Button */}
          <RemoveRightPanel
            fileName={file.name}
            fileSize={file.size}
            numPages={numPages}
            deletedCount={deletedPages.size}
            rangeInput={rangeInput}
            onRangeInputChange={handleRangeInputChange}
            onClearSelection={handleClearSelection}
            outputFileName={outputFileName}
            setOutputFileName={setOutputFileName}
            isRunning={isRunning}
            progress={progress}
            statusMessage={statusMessage}
            cancel={cancel}
            error={error}
            onOpenConfirmModal={() => setConfirmModalOpen(true)}
          />
        </div>
      )}

      {/* High-Resolution Zoom Lightbox */}
      {zoomTarget && file && (
        <PdfZoomModal
          file={file}
          pageNum={zoomTarget}
          displayPageNum={zoomTarget}
          showAngle={false}
          statusBadgeText={deletedPages.has(zoomTarget - 1) ? "Marked to Delete" : "Kept in Document"}
          statusBadgeVariant={deletedPages.has(zoomTarget - 1) ? "danger" : "success"}
          extraAction={
            <button
              type="button"
              onClick={() => togglePageDelete(zoomTarget)}
              style={{
                padding: "0.35rem 0.75rem",
                fontSize: "0.8125rem",
                fontWeight: 800,
                borderRadius: "6px",
                border: "none",
                background: deletedPages.has(zoomTarget - 1) ? "#059669" : "#dc2626",
                color: "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>{deletedPages.has(zoomTarget - 1) ? "Restore Page" : "Delete Page"}</span>
            </button>
          }
          onClose={() => setZoomTarget(null)}
        />
      )}

      {/* The Final Delete Confirmation Popup Modal */}
      {confirmModalOpen && file && (
        <FinalDeleteConfirmModal
          fileName={file.name}
          deleteCount={deletedPages.size}
          totalCount={numPages}
          deletedRangeString={rangeInput}
          onConfirm={() => { void handleRemoveSubmit(); }}
          onCancel={() => setConfirmModalOpen(false)}
        />
      )}
    </ToolWorkspaceShell>
  );
}
