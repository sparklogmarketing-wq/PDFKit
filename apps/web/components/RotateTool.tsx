"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { renderPdfPage, loadPdfPagesMap } from "../lib/pdfjs";
import { usePdfThumbnail } from "../lib/usePdfThumbnail";
import { runTool, isCancelledError } from "../lib/runTool";
import { downloadFilesAsZip } from "../lib/downloadZip";
import { formatBytes } from "../lib/formatBytes";
import PdfZoomModal from "./PdfZoomModal";
import ToolResultsView from "./ToolResultsView";
import ToolProgressBar from "./ToolProgressBar";
import ToolWorkspaceShell from "./ToolWorkspaceShell";
import ToolPanelHeader from "./ToolPanelHeader";
import type { OutputFile } from "@pdfkit/core";

/* ── Helpers ─────────────────────────────────────────────────── */

function parseRangePart(trimmed: string, maxPages: number, result: Set<number>) {
  if (trimmed.includes("-")) {
    const [startStr, endStr] = trimmed.split("-");
    const start = Math.max(1, Math.min(maxPages, Number(startStr.trim()) || 1));
    const end = endStr?.trim()
      ? Math.max(1, Math.min(maxPages, Number(endStr.trim()) || maxPages))
      : maxPages;
    const [from, to] = start <= end ? [start, end] : [end, start];
    for (let p = from; p <= to; p++) {
      result.add(p);
    }
  } else {
    const p = Number(trimmed);
    if (!Number.isNaN(p) && p >= 1 && p <= maxPages) {
      result.add(p);
    }
  }
}

function parsePagesInput(text: string, maxPages: number): Set<number> {
  const result = new Set<number>();
  if (!text?.trim()) return result;
  for (const part of text.split(",")) {
    const trimmed = part.trim();
    if (trimmed) parseRangePart(trimmed, maxPages, result);
  }
  return result;
}

/* ── Single Page Thumbnail Card ──────────────────────────────── */
function RotatePageCard({
  file,
  localPageNum,
  displayPageNum,
  angle,
  isProtected,
  onRotateLeft,
  onRotateRight,
  onZoom,
}: {
  readonly file: File;
  readonly localPageNum: number;
  readonly displayPageNum: number;
  readonly angle: number;
  readonly isProtected: boolean;
  readonly onRotateLeft: () => void;
  readonly onRotateRight: () => void;
  readonly onZoom: () => void;
}) {
  const { canvasRef, containerRef, loading } = usePdfThumbnail({
    file,
    pageNum: localPageNum,
    targetWidth: 260,
    rootMargin: "300px 0px",
  });

  const displayAngle = isProtected ? 0 : angle;
  // Scale down when rotated 90/270 so the portrait sheet frame stays intact
  const scaleRatio = displayAngle % 180 !== 0 ? 0.70 : 1;

  let borderColor = "var(--border-light)";
  if (isProtected) {
    borderColor = "#fde68a";
  } else if (displayAngle !== 0) {
    borderColor = "var(--primary)";
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: isProtected ? "#fffdf5" : "#ffffff",
        border: `1.5px solid ${borderColor}`,
        borderRadius: "10px",
        padding: "0.5rem 0.5rem 0.65rem",
        boxShadow: displayAngle !== 0
          ? "0 2px 10px rgba(124,58,237,0.15)"
          : "0 1px 4px rgba(0,0,0,0.05)",
        transition: "all 0.2s ease",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Header: Page label & Zoom */}
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.35rem",
          padding: "0 0.15rem",
        }}
      >
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: isProtected ? "#b45309" : "var(--text-main)" }}>
          {isProtected ? `p.${displayPageNum} (kept)` : `p.${displayPageNum}`}
        </span>
        <button
          type="button"
          onClick={onZoom}
          title="Zoom in page"
          style={{
            width: "20px",
            height: "20px",
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
          <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
      </div>

      {/* Vertical Page Sheet Canvas */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1.35",
          background: "#ffffff",
          borderRadius: "4px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `rotate(${displayAngle}deg) scale(${scaleRatio})`,
            transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>
      </div>

      {/* Individual Page Rotate Buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          width: "100%",
        }}
      >
        <button
          type="button"
          onClick={onRotateLeft}
          title="Rotate Left (90° CCW)"
          style={{
            flex: 1,
            padding: "0.3rem 0.2rem",
            fontSize: "0.75rem",
            fontWeight: 700,
            borderRadius: "6px",
            border: "1px solid var(--border-light)",
            background: "#ffffff",
            color: "var(--primary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.2rem",
          }}
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>Left</span>
        </button>

        <button
          type="button"
          onClick={onRotateRight}
          title="Rotate Right (90° CW)"
          style={{
            flex: 1,
            padding: "0.3rem 0.2rem",
            fontSize: "0.75rem",
            fontWeight: 700,
            borderRadius: "6px",
            border: "1px solid var(--border-light)",
            background: "#ffffff",
            color: "var(--primary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.2rem",
          }}
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span>Right</span>
        </button>
      </div>
    </div>
  );
}

/* ── Right Panel: Tabs & Subcomponents ──────────────────────── */
type RotateTab = "controls" | "range" | "pages";

function RotateControlsTab({
  onRotateGlobalLeft,
  onRotateGlobalRight,
  onResetAll,
}: {
  readonly onRotateGlobalLeft: () => void;
  readonly onRotateGlobalRight: () => void;
  readonly onResetAll: () => void;
}) {
  return (
    <div>
      <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.35rem" }}>
        Rotate Controls
      </h3>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
        Choose rotation direction for all selected PDFs. Pages configured in tabs 2 & 3 will remain protected.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.875rem" }}>
        <button
          type="button"
          onClick={onRotateGlobalLeft}
          style={{
            padding: "1rem 0.5rem",
            borderRadius: "var(--radius-md)",
            border: "1.5px solid var(--border-medium)",
            background: "var(--bg-surface)",
            color: "var(--primary)",
            fontWeight: 800,
            fontSize: "0.9375rem",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.35rem",
            boxShadow: "0 2px 6px rgba(124,58,237,0.08)",
            transition: "all 0.15s ease",
          }}
        >
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span>Rotate Left</span>
          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 500 }}>90° CCW</span>
        </button>

        <button
          type="button"
          onClick={onRotateGlobalRight}
          style={{
            padding: "1rem 0.5rem",
            borderRadius: "var(--radius-md)",
            border: "1.5px solid var(--border-medium)",
            background: "var(--bg-surface)",
            color: "var(--primary)",
            fontWeight: 800,
            fontSize: "0.9375rem",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.35rem",
            boxShadow: "0 2px 6px rgba(124,58,237,0.08)",
            transition: "all 0.15s ease",
          }}
        >
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span>Rotate Right</span>
          <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 500 }}>90° CW</span>
        </button>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={onResetAll}
          style={{
            width: "100%",
            padding: "0.65rem 0.5rem",
            borderRadius: "var(--radius-md)",
            border: "1.5px solid var(--border-light)",
            background: "#ffffff",
            color: "var(--text-secondary)",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.4rem",
          }}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <span>Reset All to 0°</span>
        </button>
      </div>
    </div>
  );
}

function RotateRangeTab({
  totalPagesAllFiles,
  rangeEnabled,
  setRangeEnabled,
  rangeFrom,
  setRangeFrom,
  rangeTo,
  setRangeTo,
}: {
  readonly totalPagesAllFiles: number;
  readonly rangeEnabled: boolean;
  readonly setRangeEnabled: (val: boolean) => void;
  readonly rangeFrom: number;
  readonly setRangeFrom: (val: number) => void;
  readonly rangeTo: number;
  readonly setRangeTo: (val: number) => void;
}) {
  return (
    <div>
      <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.35rem" }}>
        Range to NOT Rotate
      </h3>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
        Select a range of page numbers (e.g. from 1 to {Math.min(totalPagesAllFiles || 1, 3)}) that should stay in their original state and NOT be rotated.
      </p>

      <div
        style={{
          background: "#fffbeb",
          border: "1.5px solid #fde68a",
          borderRadius: "var(--radius-md)",
          padding: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <label
          htmlFor="range-exclude-checkbox"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.875rem",
            fontWeight: 700,
            color: "#92400e",
            cursor: "pointer",
            marginBottom: "1rem",
          }}
        >
          <input
            id="range-exclude-checkbox"
            type="checkbox"
            checked={rangeEnabled}
            onChange={(e) => setRangeEnabled(e.target.checked)}
            style={{ accentColor: "var(--primary)", width: "16px", height: "16px", cursor: "pointer" }}
          />
          <span>Exclude a Range of Pages</span>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <label htmlFor="range-from-input" style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#92400e", marginBottom: "0.25rem" }}>
              From Page:
            </label>
            <input
              id="range-from-input"
              type="number"
              min={1}
              max={totalPagesAllFiles || 1}
              value={rangeFrom}
              disabled={!rangeEnabled}
              onChange={(e) => setRangeFrom(Math.max(1, Number(e.target.value) || 1))}
              style={{
                width: "100%",
                padding: "0.5rem 0.6rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid #fde68a",
                background: rangeEnabled ? "#ffffff" : "#fef3c7",
                fontSize: "0.875rem",
                fontWeight: 700,
              }}
            />
          </div>

          <div>
            <label htmlFor="range-to-input" style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#92400e", marginBottom: "0.25rem" }}>
              To Page:
            </label>
            <input
              id="range-to-input"
              type="number"
              min={1}
              max={totalPagesAllFiles || 1}
              value={rangeTo}
              disabled={!rangeEnabled}
              onChange={(e) => setRangeTo(Math.max(1, Number(e.target.value) || 1))}
              style={{
                width: "100%",
                padding: "0.5rem 0.6rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid #fde68a",
                background: rangeEnabled ? "#ffffff" : "#fef3c7",
                fontSize: "0.875rem",
                fontWeight: 700,
              }}
            />
          </div>
        </div>

        {rangeEnabled && (
          <div style={{ fontSize: "0.75rem", color: "#b45309", fontWeight: 600 }}>
            ✓ Pages {Math.min(rangeFrom, rangeTo)} to {Math.max(rangeFrom, rangeTo)} will remain at 0° (Original state).
          </div>
        )}
      </div>

      {rangeEnabled && (
        <button
          type="button"
          onClick={() => setRangeEnabled(false)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--danger)",
            fontSize: "0.8125rem",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: "1rem",
          }}
        >
          Clear Range Protection
        </button>
      )}
    </div>
  );
}

function RotatePagesTab({
  notRotatePagesInput,
  setNotRotatePagesInput,
  excludedSpecificPagesSet,
}: {
  readonly notRotatePagesInput: string;
  readonly setNotRotatePagesInput: (val: string) => void;
  readonly excludedSpecificPagesSet: ReadonlySet<number>;
}) {
  return (
    <div>
      <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.35rem" }}>
        Specific Pages to NOT Rotate
      </h3>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
        Enter individual page numbers that should NOT be rotated and stay in their original state.
      </p>

      <div style={{ marginBottom: "1rem" }}>
        <label htmlFor="specific-pages-input" style={{ display: "block", fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-main)", marginBottom: "0.35rem" }}>
          Pages to Keep in Original State:
        </label>
        <input
          id="specific-pages-input"
          type="text"
          value={notRotatePagesInput}
          onChange={(e) => setNotRotatePagesInput(e.target.value)}
          placeholder="e.g. 1, 2, 7"
          style={{
            width: "100%",
            padding: "0.65rem 0.85rem",
            borderRadius: "var(--radius-md)",
            border: "1.5px solid var(--border-medium)",
            fontSize: "0.9375rem",
            outline: "none",
          }}
        />
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
          Comma-separated list (e.g. <code>1, 2, 7</code> or <code>1, 3-5</code>).
        </span>
      </div>

      {excludedSpecificPagesSet.size > 0 && (
        <div
          style={{
            padding: "0.75rem",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "var(--radius-md)",
            marginBottom: "1.25rem",
          }}
        >
          <span style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#92400e", marginBottom: "0.35rem" }}>
            Protected Pages (Not Rotated):
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {Array.from(excludedSpecificPagesSet).sort((a, b) => a - b).map((p) => (
              <span
                key={p}
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  padding: "0.15rem 0.45rem",
                  borderRadius: "4px",
                  background: "#ffffff",
                  border: "1px solid #fde68a",
                  color: "#b45309",
                }}
              >
                p. {p} (0°)
              </span>
            ))}
          </div>
        </div>
      )}

      {notRotatePagesInput.trim() && (
        <button
          type="button"
          onClick={() => setNotRotatePagesInput("")}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--danger)",
            fontSize: "0.8125rem",
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: "1rem",
          }}
        >
          Clear Excluded Pages
        </button>
      )}
    </div>
  );
}

function RotateFooter({
  filesCount,
  totalPagesAllFiles,
  isRunning,
  progress,
  statusMsg,
  cancel,
  error,
  onRotateSubmit,
}: {
  readonly filesCount: number;
  readonly totalPagesAllFiles: number;
  readonly isRunning: boolean;
  readonly progress: number | null;
  readonly statusMsg: string;
  readonly cancel: (() => void) | null;
  readonly error: string;
  readonly onRotateSubmit: () => void;
}) {
  return (
    <div
      style={{
        paddingTop: "1.25rem",
        borderTop: "1.5px solid var(--border-light)",
        marginTop: "0.5rem",
      }}
    >
      <div style={{ marginBottom: "1rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
        Rotating <strong>{filesCount}</strong> {filesCount === 1 ? "PDF" : "PDFs"} (<strong>{totalPagesAllFiles}</strong> total pages).
      </div>

      {isRunning ? (
        <ToolProgressBar
          progress={progress ? progress / 100 : 0}
          statusMsg={statusMsg}
          onCancel={cancel}
        />
      ) : (
        <button
          type="button"
          onClick={onRotateSubmit}
          className="btn-primary tool-action-btn"
        >
          <span>{filesCount > 1 ? `Rotate ${filesCount} PDFs` : "Rotate PDF"}</span>
        </button>
      )}

      {error && (
        <div className="alert-error" style={{ marginTop: "1rem" }}>
          {error}
        </div>
      )}
    </div>
  );
}

/* ── Right Panel: Tabs Component ─────────────────────────────── */
function RotateRightPanel({
  filesCount,
  totalPagesAllFiles,
  activeTab,
  setActiveTab,
  isRunning,
  progress,
  statusMsg,
  cancel,
  error,
  rangeEnabled,
  setRangeEnabled,
  rangeFrom,
  setRangeFrom,
  rangeTo,
  setRangeTo,
  notRotatePagesInput,
  setNotRotatePagesInput,
  excludedSpecificPagesSet,
  onRotateGlobalLeft,
  onRotateGlobalRight,
  onResetAll,
  onRotateSubmit,
}: {
  readonly filesCount: number;
  readonly totalPagesAllFiles: number;
  readonly activeTab: RotateTab;
  readonly setActiveTab: (tab: RotateTab) => void;
  readonly isRunning: boolean;
  readonly progress: number | null;
  readonly statusMsg: string;
  readonly cancel: (() => void) | null;
  readonly error: string;
  readonly rangeEnabled: boolean;
  readonly setRangeEnabled: (val: boolean) => void;
  readonly rangeFrom: number;
  readonly setRangeFrom: (val: number) => void;
  readonly rangeTo: number;
  readonly setRangeTo: (val: number) => void;
  readonly notRotatePagesInput: string;
  readonly setNotRotatePagesInput: (val: string) => void;
  readonly excludedSpecificPagesSet: ReadonlySet<number>;
  readonly onRotateGlobalLeft: () => void;
  readonly onRotateGlobalRight: () => void;
  readonly onResetAll: () => void;
  readonly onRotateSubmit: () => void;
}) {
  return (
    <div className="tool-sticky-panel">
      {/* Tab Navigation */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.35rem",
          background: "var(--bg-subtle)",
          padding: "0.3rem",
          borderRadius: "var(--radius-md)",
          marginBottom: "1.5rem",
          border: "1px solid var(--border-light)",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("controls")}
          style={{
            padding: "0.5rem 0.25rem",
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: activeTab === "controls" ? "var(--bg-surface)" : "transparent",
            color: activeTab === "controls" ? "var(--primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "controls" ? 800 : 600,
            fontSize: "0.8125rem",
            cursor: "pointer",
            boxShadow: activeTab === "controls" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            textAlign: "center",
          }}
        >
          1. Rotate
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("range")}
          style={{
            padding: "0.5rem 0.25rem",
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: activeTab === "range" ? "var(--bg-surface)" : "transparent",
            color: activeTab === "range" ? "var(--primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "range" ? 800 : 600,
            fontSize: "0.8125rem",
            cursor: "pointer",
            boxShadow: activeTab === "range" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            textAlign: "center",
          }}
        >
          2. Range
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pages")}
          style={{
            padding: "0.5rem 0.25rem",
            borderRadius: "var(--radius-sm)",
            border: "none",
            background: activeTab === "pages" ? "var(--bg-surface)" : "transparent",
            color: activeTab === "pages" ? "var(--primary)" : "var(--text-secondary)",
            fontWeight: activeTab === "pages" ? 800 : 600,
            fontSize: "0.8125rem",
            cursor: "pointer",
            boxShadow: activeTab === "pages" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            textAlign: "center",
          }}
        >
          3. Pages
        </button>
      </div>

      {activeTab === "controls" && (
        <RotateControlsTab
          onRotateGlobalLeft={onRotateGlobalLeft}
          onRotateGlobalRight={onRotateGlobalRight}
          onResetAll={onResetAll}
        />
      )}

      {activeTab === "range" && (
        <RotateRangeTab
          totalPagesAllFiles={totalPagesAllFiles}
          rangeEnabled={rangeEnabled}
          setRangeEnabled={setRangeEnabled}
          rangeFrom={rangeFrom}
          setRangeFrom={setRangeFrom}
          rangeTo={rangeTo}
          setRangeTo={setRangeTo}
        />
      )}

      {activeTab === "pages" && (
        <RotatePagesTab
          notRotatePagesInput={notRotatePagesInput}
          setNotRotatePagesInput={setNotRotatePagesInput}
          excludedSpecificPagesSet={excludedSpecificPagesSet}
        />
      )}

      <RotateFooter
        filesCount={filesCount}
        totalPagesAllFiles={totalPagesAllFiles}
        isRunning={isRunning}
        progress={progress}
        statusMsg={statusMsg}
        cancel={cancel}
        error={error}
        onRotateSubmit={onRotateSubmit}
      />
    </div>
  );
}

/* ── Main RotateTool Component ──────────────────────────────── */
export default function RotateTool() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Files State */
  const [files, setFiles] = useState<File[]>([]);
  const [filePagesMap, setFilePagesMap] = useState<Record<string, number>>({});

  /* Per-page angle map: key = "filename-pageNum", value = cumulative angle degrees */
  const [pageAngles, setPageAngles] = useState<Record<string, number>>({});

  /* Right Panel Tabs: "controls" (Tab 1), "range" (Tab 2), "pages" (Tab 3) */
  const [activeTab, setActiveTab] = useState<RotateTab>("controls");

  /* Tab 2: Range of Pages to NOT Rotate */
  const [rangeEnabled, setRangeEnabled] = useState(false);
  const [rangeFrom, setRangeFrom] = useState<number>(1);
  const [rangeTo, setRangeTo] = useState<number>(1);

  /* Tab 3: Specific Pages to NOT Rotate (e.g. "1, 2, 7") */
  const [notRotatePagesInput, setNotRotatePagesInput] = useState<string>("");

  /* Zoom modal state */
  const [zoomTarget, setZoomTarget] = useState<{ file: File; localPageNum: number; displayPageNum: number } | null>(null);

  /* Run & Execution State */
  const [progress, setProgress] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<{ name: string; url: string; size: number }[]>([]);
  const [cancel, setCancel] = useState<(() => void) | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const isRunning = progress !== null;

  const cancelRef = useRef<(() => void) | null>(null);
  cancelRef.current = cancel;

  /* Cleanup object URLs and cancel running worker on unmount */
  useEffect(() => {
    return () => {
      cancelRef.current?.();
      results.forEach((r) => URL.revokeObjectURL(r.url));
    };
  }, [results]);

  /* Total pages across all loaded files */
  const totalPagesAllFiles = useMemo(() => {
    return files.reduce((acc, f) => acc + (filePagesMap[f.name] || 0), 0);
  }, [files, filePagesMap]);

  /* Maximum pages in any single loaded file */
  const maxSingleFilePages = useMemo(() => {
    return files.reduce((acc, f) => Math.max(acc, filePagesMap[f.name] || 0), 0) || 1;
  }, [files, filePagesMap]);

  /* Parsed Specific Excluded Pages from Tab 3 (based on continuous page numbering) */
  const excludedSpecificPagesSet = useMemo(() => {
    return parsePagesInput(notRotatePagesInput, totalPagesAllFiles || 1);
  }, [notRotatePagesInput, totalPagesAllFiles]);

  /* Check if a given page number is protected from rotation (by globalPageNum) */
  const isPageProtected = useCallback(
    (globalPageNum: number) => {
      if (rangeEnabled) {
        const from = Math.min(rangeFrom, rangeTo);
        const to = Math.max(rangeFrom, rangeTo);
        if (globalPageNum >= from && globalPageNum <= to) {
          return true;
        }
      }
      return excludedSpecificPagesSet.has(globalPageNum);
    },
    [rangeEnabled, rangeFrom, rangeTo, excludedSpecificPagesSet]
  );

  /* Determine the effective rotation angle for a page */
  const getPageEffectiveRotation = useCallback(
    (fileName: string, localPageNum: number, globalPageNum: number) => {
      if (isPageProtected(globalPageNum)) {
        return { angle: 0, isProtected: true };
      }
      const key = `${fileName}-${localPageNum}`;
      return { angle: pageAngles[key] ?? 0, isProtected: false };
    },
    [isPageProtected, pageAngles]
  );

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

    const newPagesMap = await loadPdfPagesMap(arr, filePagesMap);
    setFilePagesMap(newPagesMap);

    const highestPage = Object.values(newPagesMap).reduce((m, c) => Math.max(m, c), 1);
    if (!rangeEnabled) {
      setRangeFrom(1);
      setRangeTo(Math.min(highestPage, 2));
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleResetAll() {
    setPageAngles({});
    setRangeEnabled(false);
    setRangeFrom(1);
    setRangeTo(Math.min(maxSingleFilePages, 2));
    setNotRotatePagesInput("");
    setError("");
  }

  function clearAllFiles() {
    setFiles([]);
    setFilePagesMap({});
    setPageAngles({});
    setRangeEnabled(false);
    setRangeFrom(1);
    setRangeTo(1);
    setNotRotatePagesInput("");
    setResults([]);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /* ── Global Rotation Controls: apply delta to every non-protected page ── */
  function applyGlobalDelta(delta: number) {
    setPageAngles((prev) => {
      const next = { ...prev };
      let globalPageNum = 1;
      for (const file of files) {
        const numPages = filePagesMap[file.name] || 0;
        for (let p = 1; p <= numPages; p++, globalPageNum++) {
          if (isPageProtected(globalPageNum)) continue;
          const key = `${file.name}-${p}`;
          const cur = next[key] ?? 0;
          next[key] = (((cur + delta) % 360) + 360) % 360;
        }
      }
      return next;
    });
  }

  /* ── Individual Page Rotation ────────────────────────────── */
  function handleSinglePageRotate(fileName: string, pageNum: number, delta: number) {
    const key = `${fileName}-${pageNum}`;
    setPageAngles((prev) => {
      const cur = prev[key] ?? 0;
      const next = (((cur + delta) % 360) + 360) % 360;
      return { ...prev, [key]: next };
    });
  }

  /* ── Process & Run Tool ──────────────────────────────────── */
  async function handleRotateSubmit() {
    if (files.length === 0 || isRunning) return;
    setError("");
    setProgress(0);
    setStatusMsg("Preparing files for rotation...");

    try {
      const inputs = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          data: new Uint8Array(await f.arrayBuffer()),
        }))
      );

      let currentGlobalPage = 1;
      const perFileRotations: Record<number, any> = {};
      for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const f = files[fIdx];
        const numPages = filePagesMap[f.name] || 1;
        const pageRotMap: Record<number, number> = {};

        for (let p = 1; p <= numPages; p++, currentGlobalPage++) {
          const key = `${f.name}-${p}`;
          const isProtected = isPageProtected(currentGlobalPage);
          pageRotMap[p] = isProtected ? 0 : (pageAngles[key] ?? 0);
        }

        perFileRotations[fIdx] = {
          pageRotations: pageRotMap,
          degrees: 0,
        };
      }

      const toolOpts = {
        degrees: 0,
        fileRotations: perFileRotations,
      };

      setStatusMsg(`Rotating ${files.length} PDF${files.length > 1 ? "s" : ""}...`);

      const job = runTool("rotate", inputs, toolOpts, (p) => {
        setProgress(Math.round(p * 100));
        setStatusMsg(`Processing pages... ${Math.round(p * 100)}%`);
      });

      setCancel(() => job.cancel);
      const outputs: OutputFile[] = await job.promise;

      const res = outputs.map((out) => {
        const blob = new Blob([out.data as BlobPart], { type: out.mime || "application/pdf" });
        return {
          name: out.name,
          url: URL.createObjectURL(blob),
          size: out.data.byteLength,
        };
      });

      setResults(res);
    } catch (err: any) {
      if (!isCancelledError(err)) {
        console.error("Rotation error:", err);
        setError(err?.message || "An error occurred during rotation.");
      }
    } finally {
      setProgress(null);
      setStatusMsg("");
      setCancel(null);
    }
  }

  async function handleDownloadAllZip() {
    if (results.length === 0 || isZipping) return;
    setIsZipping(true);
    try {
      await downloadFilesAsZip(results, "rotated_documents.zip");
    } catch (err: any) {
      console.error("Zip error:", err);
      alert("Failed to create ZIP: " + (err?.message || "Unknown error"));
    } finally {
      setIsZipping(false);
    }
  }

  /* ── RENDER: Results View ────────────────────────────────── */
  if (results.length > 0) {
    return (
      <ToolResultsView
        title="PDFs Rotated Successfully!"
        subtitle={
          results.length === 1
            ? "Your rotated document is ready to download."
            : `All ${results.length} documents have been rotated and are ready.`
        }
        results={results}
        resetLabel="Rotate More Files"
        onReset={clearAllFiles}
        onDownloadZip={() => { void handleDownloadAllZip(); }}
        isZipping={isZipping}
      />
    );
  }

  /* ── RENDER: Document Rotation Studio ──────────────────────── */
  return (
    <ToolWorkspaceShell
      error={error}
      fileInputRef={fileInputRef}
      filesCount={files.length}
      totalPages={totalPagesAllFiles}
      onFilesSelected={handleFileSelect}
    >
      {/* 2-Column Interface: Left = All Pages Preview, Right = 3 Tabs Control Panel */}
      <div className="rotate-workspace-layout">
        {/* LEFT PANEL: Preview of all pages of all selected PDFs */}
        <div className="tool-left-panel">
          {/* Header */}
          <ToolPanelHeader
            title="Pages Preview"
            description="All pages of all selected PDFs are shown vertically. Use the right panel or card buttons to rotate."
            onClear={clearAllFiles}
          />

          {/* Unified list of all documents and their pages */}
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            {files.map((file, fileIdx) => {
              const numPages = filePagesMap[file.name] || 0;
              return (
                <div
                  key={`${file.name}-${fileIdx}`}
                  style={{
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-md)",
                    padding: "1rem",
                  }}
                >
                  {/* Document Header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "1rem",
                      paddingBottom: "0.5rem",
                      borderBottom: "1px solid var(--border-light)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden" }}>
                      <span
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: "var(--bg-muted)",
                          color: "var(--primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {fileIdx + 1}
                      </span>
                      <strong
                        style={{
                          fontSize: "0.9375rem",
                          color: "var(--text-main)",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                        }}
                        title={file.name}
                      >
                        {file.name}
                      </strong>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "9999px",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-light)",
                          color: "var(--text-secondary)",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {numPages} {numPages === 1 ? "page" : "pages"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFile(fileIdx)}
                      title="Remove document"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--danger)",
                        cursor: "pointer",
                        padding: "0.2rem",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* Grid of Pages for this Document */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                      gap: "0.875rem",
                    }}
                  >
                    {Array.from({ length: numPages }, (_, i) => i + 1).map((localP) => {
                      const pageOffset = files
                        .slice(0, fileIdx)
                        .reduce((acc, f) => acc + (filePagesMap[f.name] || 0), 0);
                      const globalPageNum = pageOffset + localP;
                      const { angle, isProtected } = getPageEffectiveRotation(file.name, localP, globalPageNum);
                      return (
                        <RotatePageCard
                          key={`${file.name}-page-${localP}`}
                          file={file}
                          localPageNum={localP}
                          displayPageNum={globalPageNum}
                          angle={angle}
                          isProtected={isProtected}
                          onRotateLeft={() => handleSinglePageRotate(file.name, localP, 270)}
                          onRotateRight={() => handleSinglePageRotate(file.name, localP, 90)}
                          onZoom={() => setZoomTarget({ file, localPageNum: localP, displayPageNum: globalPageNum })}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <RotateRightPanel
          filesCount={files.length}
          totalPagesAllFiles={totalPagesAllFiles}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isRunning={isRunning}
          progress={progress}
          statusMsg={statusMsg}
          cancel={cancel}
          error={error}
          rangeEnabled={rangeEnabled}
          setRangeEnabled={setRangeEnabled}
          rangeFrom={rangeFrom}
          setRangeFrom={setRangeFrom}
          rangeTo={rangeTo}
          setRangeTo={setRangeTo}
          notRotatePagesInput={notRotatePagesInput}
          setNotRotatePagesInput={setNotRotatePagesInput}
          excludedSpecificPagesSet={excludedSpecificPagesSet}
          onRotateGlobalLeft={() => applyGlobalDelta(270)}
          onRotateGlobalRight={() => applyGlobalDelta(90)}
          onResetAll={handleResetAll}
          onRotateSubmit={() => { void handleRotateSubmit(); }}
        />
      </div>

      {/* High-Resolution Zoom Modal */}
      {zoomTarget && (() => {
        const { angle, isProtected } = getPageEffectiveRotation(
          zoomTarget.file.name,
          zoomTarget.localPageNum,
          zoomTarget.displayPageNum
        );
        return (
          <PdfZoomModal
            file={zoomTarget.file}
            pageNum={zoomTarget.localPageNum}
            angle={angle}
            isProtected={isProtected}
            onRotateLeft={() =>
              handleSinglePageRotate(zoomTarget.file.name, zoomTarget.localPageNum, 270)
            }
            onRotateRight={() =>
              handleSinglePageRotate(zoomTarget.file.name, zoomTarget.localPageNum, 90)
            }
            onClose={() => setZoomTarget(null)}
          />
        );
      })()}
    </ToolWorkspaceShell>
  );
}
