"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { renderPdfPage, getPdfInfo } from "../lib/pdfjs";
import { runTool } from "../lib/runTool";
import type { OutputFile } from "@pdfkit/core";

/* ── Types ─────────────────────────────────────────────────── */
interface Range {
  id: number;
  from: number | string;
  to: number | string;
}

type SplitMode = "range" | "every";

/* ── Tiny page thumbnail ──────────────────────────────────── */
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

/* ── Range row palette ────────────────────────────────────── */
const RANGE_COLORS = [
  "#7c3aed", "#059669", "#d97706", "#dc2626",
  "#0284c7", "#7c3aed", "#be185d", "#4f46e5",
];

/* ── Main component ───────────────────────────────────────── */
export default function SplitTool() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  /* split config */
  const [mode, setMode] = useState<SplitMode>("range");
  const [ranges, setRanges] = useState<Range[]>([{ id: 1, from: 1, to: 1 }]);
  const [nextId, setNextId] = useState(2);
  const [mergeAll, setMergeAll] = useState(false);
  const [everyN, setEveryN] = useState<number | string>(1);

  /* run state */
  const [progress, setProgress] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<{ name: string; url: string; size: number }[]>([]);
  const [cancel, setCancel] = useState<(() => void) | null>(null);
  const isRunning = progress !== null;

  /* cleanup urls on unmount */
  useEffect(() => () => { results.forEach((r) => URL.revokeObjectURL(r.url)); }, [results]);

  /* ── File handling ──────────────────────────────────────── */
  async function loadFile(f: File) {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }
    setError("");
    setResults([]);
    setFile(f);
    setProgress(null);
    const info = await getPdfInfo(f);
    const n = info?.numPages ?? 0;
    setTotalPages(n);
    setRanges([{ id: 1, from: 1, to: n || 1 }]);
    setNextId(2);
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) loadFile(e.target.files[0]);
    e.target.value = "";
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) loadFile(f);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);

  /* ── Range management ───────────────────────────────────── */
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
    // Only keep numeric digits and allow empty string while actively typing
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
          if (fromVal > toVal) {
            toVal = fromVal;
          }
        } else {
          if (toVal < fromVal) {
            fromVal = toVal;
          }
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

  /* which pages belong to a given range (0-indexed for array) */
  function pagesForRange(r: Range): number[] {
    const rawFrom = Number(r.from);
    const rawTo = Number(r.to);
    const fromNum = Math.max(1, Math.min(totalPages || 1, rawFrom || 1));
    const toNum = Math.max(fromNum, Math.min(totalPages || fromNum, rawTo || fromNum));
    const pages: number[] = [];
    for (let p = fromNum; p <= toNum; p++) pages.push(p);
    return pages;
  }

  /* ── Run ────────────────────────────────────────────────── */
  async function run() {
    if (!file) return;
    setError("");
    setResults([]);
    setProgress(0.05);
    setStatusMsg("Reading file…");

    const sanitizedRanges = ranges.map((r) => {
      const from = Math.max(1, Math.min(totalPages || 1, Number(r.from) || 1));
      const to = Math.max(from, Math.min(totalPages || from, Number(r.to) || from));
      return { ...r, from, to };
    });

    const rangesStr =
      mode === "every"
        ? undefined
        : sanitizedRanges.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}-${r.to}`)).join(",");

    const effectiveN = Math.max(1, Number(everyN) || 1);
    const opts =
      mode === "every"
        ? { mode: "every", n: effectiveN, ranges: "" }
        : { mode: "ranges", ranges: rangesStr!, n: 1 };

    const effectiveOpts = {
      mode,
      ranges: mode === "every" ? "" : rangesStr!,
      n: effectiveN,
      mergeAll: mode === "range" && mergeAll,
    };

    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const job = runTool("split", [{ name: file.name, data }], effectiveOpts, (p) => {
        setProgress(Math.max(0.1, p));
        setStatusMsg(`Processing (${Math.round(p * 100)}%)…`);
      });
      setCancel(() => () => job.cancel());
      const outputs: OutputFile[] = await job.promise;

      const mapped = outputs.map((o) => ({
        name: o.name,
        url: URL.createObjectURL(new Blob([o.data.buffer as ArrayBuffer], { type: o.mime })),
        size: o.data.byteLength,
      }));
      setResults(mapped);
      setProgress(null);
      setStatusMsg("");
      setCancel(null);
    } catch (err: any) {
      setError(err?.message ?? "An error occurred.");
      setProgress(null);
      setStatusMsg("");
      setCancel(null);
    }
  }

  function reset() {
    setFile(null);
    setTotalPages(0);
    setRanges([{ id: 1, from: 1, to: 1 }]);
    setNextId(2);
    setResults([]);
    setError("");
    setProgress(null);
    setCancel(null);
  }

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  }

  /* ── Render: no file → dropzone ──────────────────────────── */
  if (!file) {
    return (
      <div className="split-tool-wrap">
        <div
          className={`dropzone ${isDragging ? "active" : ""}`}
          style={{ minHeight: 320 }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={onInputChange} />
          <div className="dropzone-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="2" y1="13" x2="22" y2="13" strokeDasharray="3 3" />
            </svg>
          </div>
          <p className="dropzone-text-primary">Click or drag a PDF to split</p>
          <p className="dropzone-text-secondary">Select the PDF file you want to split into parts</p>
        </div>
        {error && (
          <div className="alert-error" style={{ marginTop: "1rem" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            {error}
          </div>
        )}
      </div>
    );
  }

  /* ── Render: results ─────────────────────────────────────── */
  if (results.length > 0) {
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
              onClick={() => results.forEach((r) => {
                const a = document.createElement("a");
                a.href = r.url; a.download = r.name; a.click();
              })}
              className="btn-primary"
              style={{ flex: 1 }}
            >
              Download All
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Render: main split UI ─────────────────────────────── */
  const effectiveRanges = mode === "range" ? ranges : [];

  return (
    <div className="split-tool-wrap">
      {/* ── Two-pane layout ── */}
      <div className="split-layout">

        {/* LEFT: Page preview */}
        <div className="split-preview-panel">
          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            {file.name} · {totalPages} {totalPages === 1 ? "page" : "pages"}
          </div>

          {mode === "range" && totalPages > 0 ? (
            /* Grouped by range */
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
                        borderRadius: 10,
                      }}
                    >
                      {pages.slice(0, 20).map((p) => (
                        <PageThumb key={p} file={file} pageNum={p} rangeColor={color} />
                      ))}
                      {pages.length > 20 && (
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
                          +{pages.length - 20} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Every N — flat grid */
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

        {/* RIGHT: Config panel */}
        <div className="split-config-panel">
          <h2 style={{ fontSize: "1.375rem", fontWeight: 800, margin: "0 0 1.25rem", textAlign: "center" }}>Split</h2>

          {/* Mode tabs */}
          <div className="split-mode-tabs">
            <button
              className={`split-mode-tab ${mode === "range" ? "active" : ""}`}
              onClick={() => setMode("range")}
              type="button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="9" height="18" rx="2" />
                <rect x="13" y="3" width="9" height="18" rx="2" />
              </svg>
              Range
            </button>
            <button
              className={`split-mode-tab ${mode === "every" ? "active" : ""}`}
              onClick={() => setMode("every")}
              type="button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="5" height="18" rx="1.5" />
                <rect x="9.5" y="3" width="5" height="18" rx="1.5" />
                <rect x="17" y="3" width="5" height="18" rx="1.5" />
              </svg>
              Every N Pages
            </button>
          </div>

          {/* Range mode */}
          {mode === "range" && (
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
                  checked={mergeAll}
                  onChange={(e) => setMergeAll(e.target.checked)}
                />
                <span>Merge all ranges into one PDF file</span>
              </label>
            </div>
          )}

          {/* Every N pages mode */}
          {mode === "every" && (
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
                onClick={() => { cancel?.(); setProgress(null); setCancel(null); setStatusMsg("Cancelled."); }}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="split-run-btn"
                onClick={run}
                disabled={!totalPages}
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
