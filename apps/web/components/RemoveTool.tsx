"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { renderPdfPage, getPdfInfo } from "../lib/pdfjs";
import { usePdfThumbnail } from "../lib/usePdfThumbnail";
import { runTool, isCancelledError } from "../lib/runTool";
import { formatBytes } from "../lib/formatBytes";
import { formatPagesToRangeString } from "../lib/format";
import { parsePageSpec } from "@pdfkit/core";
import { validateFilesForUpload } from "../lib/limits";
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
            <h3 id="confirm-modal-title" className="confirm-modal-title">
              Confirm Page Deletion
            </h3>
            <p className="confirm-modal-subtitle">
              Please review the pages you are removing.
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div className="confirm-modal-body">
          <p className="confirm-modal-desc">
            You are about to delete <strong>{deleteCount} {deleteCount === 1 ? "page" : "pages"}</strong> from <strong>{fileName}</strong>.
          </p>

          <div className="confirm-modal-stat-box">
            <div className="remove-confirm-stat-row">
              <span className="remove-confirm-stat-label">Pages to delete:</span>
              <strong className="remove-confirm-stat-delete">{deletedRangeString || `Count: ${deleteCount}`}</strong>
            </div>
            <div className="remove-confirm-stat-row">
              <span className="remove-confirm-stat-label">Pages remaining:</span>
              <strong className="remove-confirm-stat-keep">{remainingCount} {remainingCount === 1 ? "page" : "pages"}</strong>
            </div>
          </div>

          <div className="confirm-modal-info-box">
            Your original document will not be modified. A new PDF with the remaining pages will be downloaded.
          </div>
        </div>

        {/* Modal Footer */}
        <div className="confirm-modal-footer">
          <button
            type="button"
            onClick={onCancel}
            className="confirm-modal-btn-cancel"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="confirm-modal-btn-delete"
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
  rangeError,
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
  readonly rangeError?: string;
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
  const canDelete = numPages > 0 && deletedCount > 0 && remainingCount > 0 && !rangeError;

  return (
    <div className="tool-sticky-panel">
      {/* Document info */}
      <div className="remove-settings-header">
        <h3 className="remove-settings-title">
          Remove Pages Settings
        </h3>
        <p className="remove-settings-desc">
          {fileName} ({formatBytes(fileSize)})
        </p>
      </div>

      {/* Pages Metric Summary */}
      <div className="remove-metrics-grid">
        <div className="remove-metric-card remove-metric-card-total">
          <div className="remove-metric-label remove-metric-label-total">Total</div>
          <div className="remove-metric-val remove-metric-val-total">{numPages}</div>
        </div>

        <div className="remove-metric-card remove-metric-card-delete">
          <div className="remove-metric-label remove-metric-label-delete">To Delete</div>
          <div className="remove-metric-val remove-metric-val-delete">{deletedCount}</div>
        </div>

        <div className="remove-metric-card remove-metric-card-keep">
          <div className="remove-metric-label remove-metric-label-keep">To Keep</div>
          <div className="remove-metric-val remove-metric-val-keep">{remainingCount}</div>
        </div>
      </div>

      {/* Pages / Range input field */}
      <div className="remove-field-group">
        <label
          htmlFor="range-delete-input"
          className="remove-field-label"
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
          className="remove-field-input"
        />
        {rangeError ? (
          <p role="alert" className="remove-field-error">
            {rangeError}
          </p>
        ) : (
          <p className="remove-field-helper">
            Enter individual pages or ranges separated by commas (e.g. 1, 3-5).
          </p>
        )}

        {/* Quick action button */}
        {deletedCount > 0 && (
          <div className="remove-field-actions">
            <button
              type="button"
              onClick={onClearSelection}
              className="remove-clear-btn"
            >
              Clear Selection
            </button>
          </div>
        )}
      </div>

      {/* Output file name */}
      <div className="remove-field-group">
        <label
          htmlFor="output-file-name"
          className="remove-field-label"
        >
          Save Output As:
        </label>
        <input
          id="output-file-name"
          type="text"
          value={outputFileName}
          onChange={(e) => setOutputFileName(e.target.value)}
          disabled={isRunning}
          className="remove-field-input"
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
            <p className="remove-all-warning">
              At least 1 page must remain in the document.
            </p>
          )}
        </div>
      )}

      {error ? (
        <div className="alert-error workspace-alert" role="alert">
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
  const [rangeError, setRangeError] = useState<string>("");
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
  const loadIdRef = useRef(0);
  const runIdRef = useRef(0);

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

    cancelRef.current?.();
    setCancel(null);
    setProgress(null);
    setStatusMessage("");
    runIdRef.current++;
    const loadId = ++loadIdRef.current;

    const selectedFile = pdfs[0];
    const validation = validateFilesForUpload([selectedFile]);
    if (validation.error) {
      setError(validation.error);
      return;
    }

    setError("");
    setResults([]);
    setProgress(null);
    setDeletedPages(new Set());
    setRangeInput("");
    setRangeError("");

    const base = selectedFile.name.replace(/\.pdf$/i, "");
    setOutputFileName(`${base}-removed.pdf`);
    setFile(selectedFile);

    try {
      const info = await getPdfInfo(selectedFile);
      if (loadId !== loadIdRef.current) return;
      if (!info || typeof info.numPages !== "number" || info.numPages <= 0) {
        setError("Failed to load PDF info. Please select a valid PDF file.");
        setNumPages(0);
        return;
      }
      setNumPages(info.numPages);
    } catch {
      if (loadId !== loadIdRef.current) return;
      setError("Failed to load PDF info. Please select a valid PDF file.");
      setNumPages(0);
    }
  }, []);

  function clearAllFiles() {
    cancelRef.current?.();
    loadIdRef.current++;
    runIdRef.current++;
    setProgress(null);
    setStatusMessage("");
    setCancel(null);
    setFile(null);
    setNumPages(0);
    setDeletedPages(new Set());
    setRangeInput("");
    setRangeError("");
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
      setRangeError("");
    },
    []
  );

  /* ── Handle Manual Range Typing ──────────────────────────── */
  const handleRangeInputChange = useCallback(
    (inputVal: string) => {
      setRangeInput(inputVal);
      setError("");

      if (!inputVal.trim()) {
        setRangeError("");
        setDeletedPages(new Set());
        return;
      }

      try {
        const parsed = parsePageSpec(inputVal, numPages);
        setDeletedPages(new Set(parsed));
        setRangeError("");
      } catch (err: unknown) {
        setDeletedPages(new Set());
        const msg = err instanceof Error ? err.message : "Invalid page range.";
        setRangeError(msg);
      }
    },
    [numPages]
  );

  /* ── Selection Action ────────────────────────────────────── */
  const handleClearSelection = useCallback(() => {
    setDeletedPages(new Set());
    setRangeInput("");
    setRangeError("");
    setError("");
  }, []);

  /* ── Run Tool Execution ──────────────────────────────────── */
  async function handleRemoveSubmit() {
    if (!file || deletedPages.size === 0 || rangeError || numPages <= 0) return;
    const runId = ++runIdRef.current;
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
      if (runId !== runIdRef.current) return;
      const inputs = [{ name: file.name, data }];

      const job = runTool(
        "remove",
        inputs,
        {
          pageIndices: Array.from(deletedPages).sort((a, b) => a - b),
          outputFileName,
        },
        (p: number) => {
          if (runId === runIdRef.current) {
            setProgress(p);
            setStatusMessage(`Removing pages... ${Math.round(p * 100)}%`);
          }
        }
      );

      setCancel(() => job.cancel);
      const outputs = await job.promise;
      if (runId !== runIdRef.current || !file) return;

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
      if (runId === runIdRef.current && !isCancelledError(err)) {
        const msg = err instanceof Error ? err.message : "An error occurred while removing pages.";
        console.error("Remove pages error:", err);
        setError(msg);
      }
    } finally {
      if (runId === runIdRef.current) {
        setProgress(null);
        setStatusMessage("");
        setCancel(null);
      }
    }
  }

  /* ── RENDER: Results View ────────────────────────────────── */
  if (results.length > 0 && file) {
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
            rangeError={rangeError}
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
