"use client";

import { useState, useRef, useEffect } from "react";
import type { FieldDef, OutputFile, ToolManifest } from "@pdfkit/core";
import { runTool } from "../lib/runTool";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const defaults = (fields: FieldDef[]) =>
  Object.fromEntries(fields.map((f) => [f.key, (f as any).default ?? ""]));

export default function ToolRunner({ manifest }: { manifest: ToolManifest }) {
  const [files, setFiles] = useState<File[]>([]);
  const [opts, setOpts] = useState<Record<string, any>>(defaults(manifest.fields));
  const [progress, setProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<{ name: string; url: string; size: number }[]>([]);
  const [cancel, setCancel] = useState<(() => void) | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on unmount or before new runs
  useEffect(() => {
    return () => {
      results.forEach((r) => URL.revokeObjectURL(r.url));
    };
  }, [results]);

  function handleFileSelect(selectedFiles: FileList | File[] | null) {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const arr = Array.from(selectedFiles).filter((f) =>
      manifest.accepts.length === 0 || manifest.accepts.includes(f.type) || f.name.toLowerCase().endsWith(".pdf")
    );

    if (arr.length === 0) {
      setError("Please select valid PDF files.");
      return;
    }

    setError("");
    if (manifest.multiple) {
      // Append files, avoiding duplicate names
      setFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.name));
        const newOnes = arr.filter((f) => !existingNames.has(f.name));
        return [...prev, ...newOnes];
      });
    } else {
      setFiles([arr[0]]);
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

  function clearAllFiles() {
    setFiles([]);
    setResults([]);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Drag and drop handlers
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  }

  async function run() {
    if (files.length === 0) return;
    if (manifest.id === "merge" && files.length < 2) {
      setError("Please add at least 2 PDF files to merge.");
      return;
    }

    setError("");
    setResults([]);
    setProgress(0.05);
    setStatusMessage("Reading files...");

    try {
      const inputs = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          data: new Uint8Array(await f.arrayBuffer()),
        }))
      );

      setStatusMessage("Processing...");
      const job = runTool(manifest.id, inputs, opts, (p) => {
        setProgress(Math.max(0.1, p));
        setStatusMessage(`Processing (${Math.round(p * 100)}%)...`);
      });

      setCancel(() => job.cancel);
      const outs: OutputFile[] = await job.promise;

      setStatusMessage("Complete");
      setProgress(1);

      setResults(
        outs.map((o) => ({
          name: o.name,
          size: o.data.byteLength,
          url: URL.createObjectURL(new Blob([o.data as BlobPart], { type: o.mime })),
        }))
      );
    } catch (e: any) {
      setError(e?.message || "An unexpected error occurred during processing.");
    } finally {
      setProgress(null);
      setCancel(null);
      setStatusMessage("");
    }
  }

  const isRunning = progress !== null;

  return (
    <div className="tool-runner-panel">
      {/* File Upload & Dropzone */}
      <div className="dropzone-container">
        <div
          className={`dropzone ${isDragging ? "active" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple={manifest.multiple}
            accept={manifest.accepts.join(",")}
            onChange={(e) => {
              handleFileSelect(e.target.files);
              e.target.value = "";
            }}
          />

          <svg className="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>

          <p className="dropzone-text-primary">
            {files.length === 0
              ? manifest.multiple
                ? "Choose PDF files, or drag and drop here"
                : "Choose a PDF file, or drag and drop here"
              : manifest.multiple
              ? "Click or drop more files to add"
              : "Click to replace selected file"}
          </p>
          <span className="dropzone-badge">
            {manifest.multiple ? "Multiple files (.pdf)" : "Single file (.pdf)"}
          </span>
        </div>

        {/* Selected files list */}
        {files.length > 0 && (
          <div className="files-list-wrapper">
            <div className="files-list-header">
              <span>
                Selected Files ({files.length}
                {manifest.multiple && manifest.id === "merge" ? " • Ordered top to bottom" : ""})
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {manifest.multiple && (
                  <button
                    type="button"
                    className="quick-opt-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    + Add More
                  </button>
                )}
                <button
                  type="button"
                  className="quick-opt-btn"
                  onClick={clearAllFiles}
                  style={{ color: "var(--danger)" }}
                >
                  Clear All
                </button>
              </div>
            </div>

            <ul className="files-list">
              {files.map((file, idx) => (
                <li key={`${file.name}-${idx}`} className="file-item">
                  <div className="file-info">
                    {manifest.multiple && (
                      <span className="file-order-badge" title={`Order: #${idx + 1}`}>
                        {idx + 1}
                      </span>
                    )}
                    <svg className="file-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="9" y1="13" x2="15" y2="13"></line>
                      <line x1="9" y1="17" x2="15" y2="17"></line>
                    </svg>
                    <div className="file-meta">
                      <span className="file-name" title={file.name}>
                        {file.name}
                      </span>
                      <span className="file-size">{formatBytes(file.size)}</span>
                    </div>
                  </div>

                  <div className="file-actions">
                    {manifest.multiple && (
                      <>
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={idx === 0 || isRunning}
                          onClick={() => moveFile(idx, idx - 1)}
                          title="Move up in merge sequence"
                        >
                          &uarr;
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={idx === files.length - 1 || isRunning}
                          onClick={() => moveFile(idx, idx + 1)}
                          title="Move down in merge sequence"
                        >
                          &darr;
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="icon-btn delete"
                      disabled={isRunning}
                      onClick={() => removeFile(idx)}
                      title="Remove file"
                    >
                      &times;
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Tool Parameters & Options */}
      {manifest.fields.length > 0 && (
        <div className="options-panel">
          <h3 className="options-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Configuration Options
          </h3>

          <div className="fields-grid">
            {manifest.fields.map((f) => {
              // Conditional field hiding for Split tool
              if (manifest.id === "split") {
                if (f.key === "ranges" && opts["mode"] === "every") return null;
                if (f.key === "n" && opts["mode"] === "ranges") return null;
              }

              return (
                <div key={f.key} className="field-wrapper">
                  <label className="field-label" htmlFor={`field-${f.key}`}>
                    <span>{f.label}</span>
                    {f.help && <span className="field-help">{f.help}</span>}
                  </label>

                  {f.type === "select" ? (
                    <div>
                      <select
                        id={`field-${f.key}`}
                        className="input-control"
                        value={opts[f.key]}
                        onChange={(e) => setOpts({ ...opts, [f.key]: e.target.value })}
                      >
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>

                      {/* Quick buttons for degrees in Rotate tool */}
                      {manifest.id === "rotate" && f.key === "degrees" && (
                        <div className="quick-options-row">
                          {f.options.map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              className={`quick-opt-btn ${opts[f.key] === o.value ? "active" : ""}`}
                              onClick={() => setOpts({ ...opts, [f.key]: o.value })}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : f.type === "checkbox" ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <input
                        id={`field-${f.key}`}
                        type="checkbox"
                        checked={!!opts[f.key]}
                        onChange={(e) => setOpts({ ...opts, [f.key]: e.target.checked })}
                      />
                      <label htmlFor={`field-${f.key}`} style={{ fontSize: "0.875rem", cursor: "pointer" }}>
                        {f.label}
                      </label>
                    </div>
                  ) : (
                    <div>
                      <input
                        id={`field-${f.key}`}
                        className="input-control"
                        type={f.type}
                        value={opts[f.key]}
                        placeholder={(f as any).placeholder}
                        min={(f as any).min}
                        max={(f as any).max}
                        onChange={(e) =>
                          setOpts({
                            ...opts,
                            [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                          })
                        }
                      />

                      {/* Helper pills for Rotate pages */}
                      {manifest.id === "rotate" && f.key === "pages" && (
                        <div className="quick-options-row">
                          <button
                            type="button"
                            className={`quick-opt-btn ${!opts[f.key] ? "active" : ""}`}
                            onClick={() => setOpts({ ...opts, [f.key]: "" })}
                          >
                            All Pages
                          </button>
                          <button
                            type="button"
                            className={`quick-opt-btn ${opts[f.key] === "1" ? "active" : ""}`}
                            onClick={() => setOpts({ ...opts, [f.key]: "1" })}
                          >
                            First Page Only
                          </button>
                        </div>
                      )}

                      {/* Helper pills for Split ranges */}
                      {manifest.id === "split" && f.key === "ranges" && (
                        <div className="quick-options-row">
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Presets:</span>
                          <button
                            type="button"
                            className="quick-opt-btn"
                            onClick={() => setOpts({ ...opts, [f.key]: "1-3, 4-" })}
                          >
                            1-3, 4-
                          </button>
                          <button
                            type="button"
                            className="quick-opt-btn"
                            onClick={() => setOpts({ ...opts, [f.key]: "1, 2-" })}
                          >
                            First page & rest
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Controls */}
      <div className="action-controls">
        <div className="action-buttons-row">
          <button
            type="button"
            className="btn-primary"
            onClick={run}
            disabled={!files.length || isRunning}
          >
            {isRunning ? (
              <>
                <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"></circle>
                  <path d="M12 2a10 10 0 0 1 10 10"></path>
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Run {manifest.title}
              </>
            )}
          </button>

          {cancel && (
            <button
              type="button"
              className="btn-danger-outline"
              onClick={() => {
                cancel();
                setProgress(null);
                setCancel(null);
                setStatusMessage("Operation cancelled");
              }}
            >
              Cancel
            </button>
          )}

          {files.length > 0 && !isRunning && (
            <button type="button" className="btn-secondary" onClick={clearAllFiles}>
              Reset
            </button>
          )}
        </div>

        {/* Progress Display */}
        {isRunning && (
          <div className="progress-card">
            <div className="progress-header">
              <span>{statusMessage}</span>
              <span>{Math.round((progress ?? 0) * 100)}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.max(5, (progress ?? 0) * 100)}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div role="alert" className="alert-error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div>
              <strong>Error: </strong> {error}
            </div>
          </div>
        )}
      </div>

      {/* Results / Download Section */}
      {results.length > 0 && (
        <div className="results-card">
          <div className="results-header">
            <div className="success-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div>
              <h3 className="results-title">Output Files</h3>
              <p className="results-subtitle">
                {results.length === 1 ? "1 file ready for download" : `${results.length} files ready for download`}
              </p>
            </div>
          </div>

          <div className="output-files-grid">
            {results.map((r) => (
              <div key={r.url} className="output-file-item">
                <div className="output-file-info">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <div>
                    <strong style={{ display: "block", fontSize: "0.9375rem" }}>{r.name}</strong>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      Size: {formatBytes(r.size)}
                    </span>
                  </div>
                </div>

                <div className="output-actions">
                  <button
                    type="button"
                    className="btn-preview"
                    onClick={() => window.open(r.url, "_blank")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    Preview
                  </button>

                  <a className="btn-success" href={r.url} download={r.name}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
