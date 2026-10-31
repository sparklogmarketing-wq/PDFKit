"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { runTool, isCancelledError } from "../lib/runTool";
import {
  filterWordAndPdfFiles,
  appendUniqueFiles,
  uint8ArrayToBlob,
  formatBytes,
} from "../lib/format";
import { validateFilesForUpload, getPayloadMemoryWarning } from "../lib/limits";
import ToolResultsView from "./ToolResultsView";
import ToolProgressBar from "./ToolProgressBar";
import ToolWorkspaceShell from "./ToolWorkspaceShell";
import ToolPanelHeader from "./ToolPanelHeader";
import type { OutputFile } from "@pdfkit/core";

/* ── Helpers ─────────────────────────────────────────────────── */
function resolveOutputPdfName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "converted.pdf";
  if (trimmed.toLowerCase().endsWith(".pdf")) return trimmed;
  return `${trimmed}.pdf`;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : "DOC";
}

function getRotationClass(angle: number): string {
  const norm = ((angle % 360) + 360) % 360;
  if (norm === 90) return "rot-90";
  if (norm === 180) return "rot-180";
  if (norm === 270) return "rot-270";
  return "rot-0";
}

/* ── Selected Document Card ──────────────────────────────────── */
interface WordDocumentCardProps {
  readonly file: File;
  readonly index: number;
  readonly rotation: number;
  readonly isDragging: boolean;
  readonly isDropTarget: boolean;
  readonly disabled?: boolean;
  readonly onDragStart: (e: React.DragEvent, index: number) => void;
  readonly onDragOver: (e: React.DragEvent, index: number) => void;
  readonly onDragEnter: (e: React.DragEvent, index: number) => void;
  readonly onDragLeave: (e: React.DragEvent, index: number) => void;
  readonly onDrop: (e: React.DragEvent, index: number) => void;
  readonly onDragEnd: () => void;
  readonly onRotate: (index: number) => void;
  readonly onRemove: (index: number) => void;
}

function WordDocumentCard({
  file,
  index,
  rotation,
  isDragging,
  isDropTarget,
  disabled,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  onRotate,
  onRemove,
}: WordDocumentCardProps) {
  const ext = getFileExtension(file.name);
  const rotClass = getRotationClass(rotation);

  return (
    <div
      className={`pdf-thumb-card ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
      draggable={!disabled}
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
          {/* Rotate 90° Clockwise */}
          <button
            type="button"
            className="pdf-thumb-action-btn rotate-btn"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onRotate(index);
            }}
            title="Rotate 90° clockwise"
            aria-label={`Rotate ${file.name} 90° clockwise`}
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
              <path d="M21.34 15.57a10 10 0 1 1-.57-8.38" />
            </svg>
          </button>

          {/* Remove Button */}
          <button
            type="button"
            className="pdf-thumb-action-btn delete-btn"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(index);
            }}
            title="Remove file"
            aria-label={`Remove ${file.name}`}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Document Sheet Preview with Rotation */}
      <div className="pdf-thumb-sheet-wrapper">
        <div className={`word-thumb-sheet ${rotClass}`}>
          <div className="word-card-badge">
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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>{ext}</span>
          </div>

          <svg
            aria-hidden="true"
            className="word-card-preview-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M8 13l2 5 2-5 2 5 2-5" />
          </svg>

          <div className="word-card-lines">
            <div className="word-card-line" />
            <div className="word-card-line" />
            <div className="word-card-line short" />
          </div>
        </div>
      </div>

      {/* Card Footer */}
      <div className="word-card-footer">
        <span className="word-card-name" title={file.name}>
          {file.name}
        </span>
        <div className="word-card-meta">
          <span>{formatBytes(file.size)}</span>
          {rotation > 0 ? (
            <span className="word-card-rot-badge" title="Rotation angle applied">
              {rotation}°
            </span>
          ) : (
            <span>Ready</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Right Panel: Controls & Sequence Manager ────────────────── */
interface WordRightPanelProps {
  readonly files: readonly File[];
  readonly fileRotations: Readonly<Record<string, number>>;
  readonly mergeAll: boolean;
  readonly onToggleMerge: () => void;
  readonly outputFileName: string;
  readonly setOutputFileName: (val: string) => void;
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
  readonly onRotateAll: () => void;
  readonly onSubmit: () => void;
}

function WordRightPanel({
  files,
  fileRotations,
  mergeAll,
  onToggleMerge,
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
  onRotateAll,
  onSubmit,
}: WordRightPanelProps) {
  const canConvert = files.length > 0;
  const totalSizeBytes = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="tool-sticky-panel">
      {/* Panel Header */}
      <div className="merge-settings-header">
        <h3 className="merge-settings-title">Word to PDF Settings</h3>
        <p className="merge-settings-desc">
          Convert Word documents (.docx, .doc) into high-quality PDF files.
        </p>
      </div>

      {/* Output Mode Toggle — only when 2+ files */}
      {files.length > 1 && (
        <div className="word-output-mode">
          <span className="word-output-mode-label">Output</span>
          <div className="word-output-mode-options">
            <button
              type="button"
              className={`word-output-mode-btn${!mergeAll ? " active" : ""}`}
              disabled={isRunning}
              onClick={() => { if (mergeAll) onToggleMerge(); }}
              title="Each document converted to its own PDF file"
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Separate Files
            </button>
            <button
              type="button"
              className={`word-output-mode-btn${mergeAll ? " active" : ""}`}
              disabled={isRunning}
              onClick={() => { if (!mergeAll) onToggleMerge(); }}
              title="Combine all converted pages into one PDF"
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="7" height="14" rx="1" />
                <rect x="9" y="4" width="7" height="17" rx="1" />
                <rect x="16" y="1" width="7" height="20" rx="1" />
              </svg>
              Combine PDFs
            </button>
          </div>
        </div>
      )}

      {/* Sequence List Header & Sort Actions */}
      <div className="merge-seq-header">
        <span className="merge-seq-label">
          Sequence ({files.length} {files.length === 1 ? "file" : "files"})
        </span>
        <div className="merge-sort-actions">
          <button
            type="button"
            onClick={onSortAlpha}
            title="Reorder alphabetically by file name (A-Z)"
            className="merge-sort-btn"
          >
            A-Z
          </button>
          <button
            type="button"
            onClick={onReverse}
            title="Reverse sequence order"
            className="merge-sort-btn"
          >
            Reverse
          </button>
          <button
            type="button"
            onClick={onRotateAll}
            title="Rotate all documents 90° clockwise"
            className="merge-sort-btn"
          >
            Rotate All
          </button>
        </div>
      </div>

      {/* Sequence List */}
      <div className="merge-seq-list">
        {files.map((file, idx) => {
          const rot = fileRotations[file.name] || 0;
          return (
            <div key={`${file.name}-${idx}`} className="merge-seq-item">
              <div className="merge-seq-item-info">
                <span className="merge-seq-badge">{idx + 1}</span>
                <span className="merge-seq-name" title={file.name}>
                  {file.name}
                </span>
                {rot > 0 && <span className="word-card-rot-badge">{rot}°</span>}
              </div>

              <div className="merge-seq-actions">
                <button
                  type="button"
                  disabled={idx === 0 || isRunning}
                  onClick={() => onMoveUp(idx)}
                  title="Move Up"
                  aria-label={`Move ${file.name} up`}
                  className="merge-seq-btn"
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>

                <button
                  type="button"
                  disabled={idx === files.length - 1 || isRunning}
                  onClick={() => onMoveDown(idx)}
                  title="Move Down"
                  aria-label={`Move ${file.name} down`}
                  className="merge-seq-btn"
                >
                  <svg
                    aria-hidden="true"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => onRemove(idx)}
                  title="Remove file"
                  aria-label={`Remove ${file.name}`}
                  className="merge-seq-remove-btn"
                >
                  &times;
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Output Name Setting */}
      <div className="merge-output-setting">
        <label htmlFor="word-output-name-input" className="merge-output-label">
          {mergeAll && files.length > 1 ? "Combined Output File Name:" : "Output File Name Pattern:"}
        </label>
        <input
          id="word-output-name-input"
          type="text"
          value={outputFileName}
          onChange={(e) => setOutputFileName(e.target.value)}
          placeholder={mergeAll && files.length > 1 ? "combined.pdf" : "document.pdf"}
          className="merge-output-input"
          disabled={isRunning}
        />
      </div>

      {/* Summary Card */}
      <div className="merge-summary-card">
        <div className="merge-summary-row">
          <span>Total Documents:</span>
          <strong className="merge-summary-val">{files.length}</strong>
        </div>
        <div className="merge-summary-row">
          <span>Total Size:</span>
          <strong className="merge-summary-val">{formatBytes(totalSizeBytes)}</strong>
        </div>
        {mergeAll && files.length > 1 && (
          <div className="merge-summary-row">
            <span>Output:</span>
            <strong className="merge-summary-val word-combine-badge">1 Combined PDF</strong>
          </div>
        )}
      </div>

      {/* Action / Submit Area */}
      <div>
        {isRunning ? (
          <ToolProgressBar
            progress={progress}
            statusMsg={statusMessage || `Converting... ${Math.round((progress ?? 0) * 100)}%`}
            onCancel={cancel}
          />
        ) : (
          <button
            type="button"
            disabled={!canConvert}
            onClick={onSubmit}
            className="btn-primary tool-action-btn"
          >
            <span>
              {mergeAll && files.length > 1
                ? `Convert & Combine ${files.length} Files`
                : files.length > 1
                ? `Convert ${files.length} Files to PDF`
                : "Convert to PDF"}
            </span>
          </button>
        )}

        {error ? (
          <div className="alert-error workspace-alert" role="alert">
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── Main WordToPdfTool Component ───────────────────────────── */
export default function WordToPdfTool() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Files and options state */
  const [files, setFiles] = useState<File[]>([]);
  const [fileRotations, setFileRotations] = useState<Record<string, number>>({});
  const [mergeAll, setMergeAll] = useState(false);
  const [outputFileName, setOutputFileName] = useState("converted.pdf");

  /* Drag & Drop Reorder states */
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  /* Execution state */
  const [progress, setProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<{ name: string; url: string; size: number }[]>([]);
  const [cancel, setCancel] = useState<(() => void) | null>(null);
  const isRunning = progress !== null;

  const cancelRef = useRef<(() => void) | null>(null);
  cancelRef.current = cancel;
  const runIdRef = useRef(0);

  /* Cleanup object URLs on unmount */
  useEffect(() => {
    return () => {
      cancelRef.current?.();
      results.forEach((res) => URL.revokeObjectURL(res.url));
    };
  }, [results]);

  const memoryWarning = useMemo(() => getPayloadMemoryWarning(files), [files]);

  /* ── File Selection ────────────────────────────────────────── */
  const handleFileSelect = useCallback(
    (selectedFiles: FileList | File[] | null, append = true) => {
      const filtered = filterWordAndPdfFiles(selectedFiles);
      if (filtered.length === 0) {
        setError("Please select valid Word (.docx, .doc) or PDF files.");
        return;
      }

      const validation = validateFilesForUpload(filtered, append ? files : []);
      if (validation.error) {
        setError(validation.error);
        return;
      }

      if (!append) {
        cancelRef.current?.();
        setCancel(null);
        setProgress(null);
        setStatusMessage("");
        runIdRef.current++;
      }

      setError("");
      setResults([]);
      setProgress(null);

      setFiles((prev) => (append ? appendUniqueFiles(prev, filtered) : appendUniqueFiles([], filtered)));
    },
    [files]
  );

  /* ── Rotation Controls (Individual on Each Selected File) ─── */
  const handleRotateFile = useCallback(
    (index: number) => {
      const file = files[index];
      if (!file) return;
      setFileRotations((prev) => ({
        ...prev,
        [file.name]: ((prev[file.name] ?? 0) + 90) % 360,
      }));
    },
    [files]
  );

  const handleRotateAll = useCallback(() => {
    setFileRotations((prev) => {
      const next: Record<string, number> = {};
      for (const f of files) {
        next[f.name] = ((prev[f.name] ?? 0) + 90) % 360;
      }
      return next;
    });
  }, [files]);

  /* ── Remove File Control on Each Selected File ─────────────── */
  const removeFile = useCallback(
    (index: number) => {
      const target = files[index];
      if (target) {
        setFileRotations((r) => {
          const copy = { ...r };
          delete copy[target.name];
          return copy;
        });
      }
      setFiles((prev) => prev.filter((_, i) => i !== index));
    },
    [files]
  );

  /* ── Reorder by Name (A-Z) Option ─────────────────────────── */
  const handleSortAlphabetical = useCallback(() => {
    setFiles((prev) => [...prev].sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  const handleReverseOrder = useCallback(() => {
    setFiles((prev) => [...prev].reverse());
  }, []);

  const moveFile = useCallback((fromIndex: number, toIndex: number) => {
    setFiles((prev) => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const clearAllFiles = useCallback(() => {
    cancelRef.current?.();
    runIdRef.current++;
    setCancel(null);
    setProgress(null);
    setStatusMessage("");
    setFiles([]);
    setFileRotations({});
    setResults([]);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /* ── Drag & Drop Reordering ───────────────────────────────── */
  const handleCardDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${index}`);
  }, []);

  const handleCardDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(index);
  }, []);

  const handleCardDragEnter = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIdx(index);
  }, []);

  const handleCardDragLeave = useCallback(() => {
    // no-op
  }, []);

  const handleCardDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      if (draggedIdx !== null && draggedIdx !== dropIndex) {
        moveFile(draggedIdx, dropIndex);
      }
      setDraggedIdx(null);
      setDragOverIdx(null);
    },
    [draggedIdx, moveFile]
  );

  const handleCardDragEnd = useCallback(() => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  }, []);

  /* ── Convert to PDF Submission ────────────────────────────── */
  const handleSubmit = useCallback(async () => {
    if (files.length === 0 || isRunning) return;
    const runId = ++runIdRef.current;
    setError("");
    setProgress(0);
    setStatusMessage("Reading document files...");

    try {
      const inputs = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setStatusMessage(`Reading ${f.name} (${i + 1}/${files.length})...`);
        inputs.push({
          name: f.name,
          data: new Uint8Array(await f.arrayBuffer()),
        });
        if (runId !== runIdRef.current) return;
      }

      setStatusMessage(`Converting ${files.length} document${files.length > 1 ? "s" : ""} to PDF...`);

      const opts = {
        mergeAll,
        rotations: fileRotations,
        outputName: resolveOutputPdfName(outputFileName),
      };

      const job = runTool("word-to-pdf", inputs, opts, (p) => {
        if (runId === runIdRef.current) {
          setProgress((prev) => (prev === null ? p : Math.max(prev, p)));
          setStatusMessage(`Converting documents... ${Math.round(p * 100)}%`);
        }
      });

      setCancel(() => job.cancel);
      const outputs: OutputFile[] = await job.promise;
      if (runId !== runIdRef.current || files.length === 0) return;

      const res = outputs.map((out) => {
        const blob = uint8ArrayToBlob(out.data, out.mime);
        return {
          name: out.name,
          url: URL.createObjectURL(blob),
          size: out.data.byteLength,
        };
      });

      setResults(res);
    } catch (err: unknown) {
      if (runId === runIdRef.current && !isCancelledError(err)) {
        const msg = err instanceof Error ? err.message : "An error occurred during Word to PDF conversion.";
        console.error("Word to PDF error:", err);
        setError(msg);
      }
    } finally {
      if (runId === runIdRef.current) {
        setProgress(null);
        setStatusMessage("");
        setCancel(null);
      }
    }
  }, [files, isRunning, mergeAll, fileRotations, outputFileName]);

  /* ── RENDER: Results View ─────────────────────────────────── */
  if (results.length > 0 && files.length > 0) {
    return (
      <ToolResultsView
        title="Converted to PDF Successfully!"
        subtitle={
          results.length === 1
            ? "Your PDF document is ready for download."
            : `All ${results.length} documents have been converted to PDF and are ready.`
        }
        results={results}
        resetLabel="Convert More Documents"
        onReset={clearAllFiles}
      />
    );
  }

  /* ── RENDER: Active Workspace ─────────────────────────────── */
  return (
    <ToolWorkspaceShell
      filesCount={files.length}
      totalPages={files.length}
      error={error}
      warning={memoryWarning || undefined}
      fileInputRef={fileInputRef}
      accept=".docx,.doc,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/pdf"
      emptyDropzoneText="Choose Word or PDF files, or drag and drop here"
      emptyDropzoneBadge="Multiple files (.docx, .doc, .pdf)"
      compactDropzoneBadge={`${files.length} ${files.length === 1 ? "document" : "documents"} selected`}
      onFilesSelected={(selected, append) => {
        handleFileSelect(selected, append);
      }}
    >
      <div className="merge-workspace-layout">
        {/* LEFT PANEL: Selected Document Cards with Rotate & Remove */}
        <div className="tool-left-panel">
          <ToolPanelHeader
            title={`Files to Convert (${files.length})`}
            description="Rotate or remove each document using its card buttons. Drag cards to reorder."
            onClear={clearAllFiles}
          />

          <div className="pdf-thumbs-grid">
            {files.map((file, idx) => (
              <WordDocumentCard
                key={`${file.name}-${idx}`}
                file={file}
                index={idx}
                rotation={fileRotations[file.name] || 0}
                isDragging={draggedIdx === idx}
                isDropTarget={dragOverIdx === idx && draggedIdx !== idx}
                disabled={isRunning}
                onDragStart={handleCardDragStart}
                onDragOver={handleCardDragOver}
                onDragEnter={handleCardDragEnter}
                onDragLeave={handleCardDragLeave}
                onDrop={handleCardDrop}
                onDragEnd={handleCardDragEnd}
                onRotate={handleRotateFile}
                onRemove={removeFile}
              />
            ))}
          </div>
        </div>

        {/* RIGHT PANEL: Sequence Manager, Options, Reorder by Name, and Convert */}
        <WordRightPanel
          files={files}
          fileRotations={fileRotations}
          mergeAll={mergeAll}
          onToggleMerge={() => setMergeAll((v) => !v)}
          outputFileName={outputFileName}
          setOutputFileName={setOutputFileName}
          isRunning={isRunning}
          progress={progress}
          statusMessage={statusMessage}
          cancel={cancel}
          error={error}
          onMoveUp={(i) => moveFile(i, i - 1)}
          onMoveDown={(i) => moveFile(i, i + 1)}
          onRemove={removeFile}
          onSortAlpha={handleSortAlphabetical}
          onReverse={handleReverseOrder}
          onRotateAll={handleRotateAll}
          onSubmit={() => {
            void handleSubmit();
          }}
        />
      </div>
    </ToolWorkspaceShell>
  );
}
