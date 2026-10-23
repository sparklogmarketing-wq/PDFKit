"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { loadPdfPagesMap } from "../lib/pdfjs";
import { runTool, isCancelledError } from "../lib/runTool";
import { calculateTotalPages, filterPdfFiles, appendUniqueFiles } from "../lib/format";
import PdfZoomModal from "./PdfZoomModal";
import PdfThumbnailCard from "./PdfThumbnailCard";
import ToolResultsView from "./ToolResultsView";
import ToolProgressBar from "./ToolProgressBar";
import ToolWorkspaceShell from "./ToolWorkspaceShell";
import ToolPanelHeader from "./ToolPanelHeader";
import type { OutputFile } from "@pdfkit/core";

/* ── Helpers ─────────────────────────────────────────────────── */
function resolveMergedFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "merged.pdf";
  if (trimmed.toLowerCase().endsWith(".pdf")) return trimmed;
  return `${trimmed}.pdf`;
}

function handleCardDragLeave() {
  // no-op drag leave
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
    <div className="tool-sticky-panel">
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
          <ToolProgressBar
            progress={progress}
            statusMsg={statusMessage || `Merging... ${Math.round((progress ?? 0) * 100)}%`}
            onCancel={cancel}
          />
        ) : (
          <button
            type="button"
            disabled={!canMerge}
            onClick={onMergeSubmit}
            className="btn-primary tool-action-btn"
          >
            <span>Merge PDFs</span>
          </button>
        )}

        {error ? (
          <div className="alert-error" role="alert" style={{ marginTop: "1rem" }}>
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── Main MergeTool Component ───────────────────────────────── */
export default function MergeTool() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Files State */
  const [files, setFiles] = useState<File[]>([]);
  const filesRef = useRef(files);
  filesRef.current = files;
  const [filePagesMap, setFilePagesMap] = useState<Record<string, number>>({});
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

  const cancelRef = useRef<(() => void) | null>(null);
  cancelRef.current = cancel;
  const loadIdRef = useRef(0);
  const runIdRef = useRef(0);

  /* Cleanup object URLs and cancel running worker on unmount */
  useEffect(() => {
    return () => {
      cancelRef.current?.();
      results.forEach((res) => URL.revokeObjectURL(res.url));
    };
  }, [results]);

  /* Total pages across all loaded files */
  const totalPagesAllFiles = useMemo(
    () => calculateTotalPages(files, filePagesMap),
    [files, filePagesMap]
  );

  /* ── Load Files ──────────────────────────────────────────── */
  async function handleFileSelect(selectedFiles: FileList | File[] | null, append = true) {
    const pdfs = filterPdfFiles(selectedFiles);
    if (pdfs.length === 0) {
      setError("Please select valid PDF files.");
      return;
    }

    if (!append) {
      cancelRef.current?.();
      setCancel(null);
      setProgress(null);
      setStatusMessage("");
      runIdRef.current++;
    }
    const loadId = ++loadIdRef.current;

    setError("");
    setResults([]);
    setProgress(null);

    const updated = append ? appendUniqueFiles(files, pdfs) : pdfs;
    setFiles(updated);

    const newPages = await loadPdfPagesMap(pdfs, filePagesMap);
    if (loadId !== loadIdRef.current) return;
    setFilePagesMap(newPages);
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
    cancelRef.current?.();
    loadIdRef.current++;
    runIdRef.current++;
    setCancel(null);
    setProgress(null);
    setStatusMessage("");
    setFiles([]);
    setFilePagesMap({});
    setResults([]);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /* ── Single Document Rotation (90° clockwise or 270° counter-clockwise) ── */
  async function handleRotateFile(index: number, deg = 90) {
    const currentFiles = filesRef.current;
    const file = currentFiles[index];
    if (!file || rotatingIdx !== null) return;
    setRotatingIdx(index);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const job = runTool("rotate", [{ name: file.name, data }], { degrees: deg }, () => {});
      const [out] = await job.promise;
      const rotatedFile = new File([out.data as BlobPart], file.name, {
        type: file.type || "application/pdf",
        lastModified: Date.now(),
      });

      const next = [...filesRef.current];
      next[index] = rotatedFile;
      filesRef.current = next;
      setFiles(next);

      setZoomTarget((prev) => {
        if (prev?.index === index) {
          return { file: rotatedFile, index };
        }
        return prev;
      });
    } catch (err: unknown) {
      if (!isCancelledError(err)) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("Failed to rotate file:", err);
        setError("Failed to rotate document: " + msg);
      }
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

// drag leave handled in outer scope

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
    const runId = ++runIdRef.current;
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
      if (runId !== runIdRef.current) return;

      setStatusMessage(`Merging ${files.length} PDFs...`);

      const job = runTool("merge", inputs, {}, (p) => {
        if (runId === runIdRef.current) {
          setProgress(p);
          setStatusMessage(`Merging documents... ${Math.round(p * 100)}%`);
        }
      });

      setCancel(() => job.cancel);
      const outputs: OutputFile[] = await job.promise;
      if (runId !== runIdRef.current || files.length === 0) return;

      const finalName = resolveMergedFileName(outputFileName);

      const res = outputs.map((out) => {
        const blob = new Blob([out.data as BlobPart], { type: out.mime || "application/pdf" });
        return {
          name: finalName,
          url: URL.createObjectURL(blob),
          size: out.data.byteLength,
        };
      });

      setResults(res);
    } catch (err: unknown) {
      if (runId === runIdRef.current && !isCancelledError(err)) {
        const msg = err instanceof Error ? err.message : "An error occurred during merging.";
        console.error("Merge error:", err);
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
  if (results.length > 0 && files.length > 0) {
    return (
      <ToolResultsView
        title="PDFs Merged Successfully!"
        subtitle="Your combined PDF document is ready for download."
        results={results}
        resetLabel="Merge More Files"
        onReset={clearAllFiles}
      />
    );
  }

  /* ── RENDER: Active 2-Column Workspace ───────────────────── */
  return (
    <ToolWorkspaceShell
      filesCount={files.length}
      totalPages={totalPagesAllFiles}
      error={error}
      fileInputRef={fileInputRef}
      onFilesSelected={(selected, append) => {
        void handleFileSelect(selected, append);
      }}
    >
      {/* 2-Column Interface: Left = Files Preview Grid, Right = Merge Sequence & Controls */}
      <div className="merge-workspace-layout">
        {/* LEFT PANEL: Preview grid of all documents */}
        <div className="tool-left-panel">
          {/* Header */}
          <ToolPanelHeader
            title={`Files to Merge (${files.length})`}
            description="Drag cards to reorder the sequence. You can also rotate or preview each document."
            onClear={clearAllFiles}
          />

          {/* Cards Grid */}
          <div className="pdf-thumbs-grid">
            {files.map((file, idx) => (
              <PdfThumbnailCard
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
          isRotating={rotatingIdx === zoomTarget.index}
          onRotateLeft={() => { void handleRotateFile(zoomTarget.index, 270); }}
          onRotateRight={() => { void handleRotateFile(zoomTarget.index, 90); }}
          onClose={() => setZoomTarget(null)}
        />
      )}
    </ToolWorkspaceShell>
  );
}
