"use client";

import { formatBytes } from "../lib/formatBytes";

export interface ToolResultItem {
  readonly name: string;
  readonly url: string;
  readonly size: number;
}

interface ToolResultsViewProps {
  readonly title: string;
  readonly subtitle: string;
  readonly results: readonly ToolResultItem[];
  readonly resetLabel: string;
  readonly onReset: () => void;
  readonly onDownloadZip?: () => void;
  readonly isZipping?: boolean;
  readonly error?: string | null;
}

export default function ToolResultsView({
  title,
  subtitle,
  results,
  resetLabel,
  onReset,
  onDownloadZip,
  isZipping = false,
  error = null,
}: ToolResultsViewProps) {
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
          {title}
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", marginBottom: "2rem" }}>
          {subtitle}
        </p>

        {error && (
          <div
            role="alert"
            className="alert-error"
            style={{ maxWidth: 520, margin: "0 auto 1.5rem" }}
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>{error}</div>
          </div>
        )}

        {results.length > 1 && onDownloadZip && (
          <div style={{ marginBottom: "2rem" }}>
            <button
              type="button"
              onClick={onDownloadZip}
              disabled={isZipping}
              className="btn-primary"
              style={{
                fontSize: "1.0625rem",
                padding: "0.875rem 2rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.6rem",
                boxShadow: "var(--shadow-md)",
              }}
            >
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{isZipping ? "Creating ZIP..." : `Download All ${results.length} PDFs (ZIP)`}</span>
            </button>
          </div>
        )}

        <div
          style={{
            maxWidth: results.length === 1 ? 500 : undefined,
            margin: results.length === 1 ? "0 auto 2.5rem" : "0 0 2.5rem 0",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            textAlign: "left",
          }}
        >
          {results.map((r, i) => (
            <div
              key={`${r.name}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.875rem 1.25rem",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", overflow: "hidden" }}>
                <div style={{ color: "var(--primary)", flexShrink: 0 }}>
                  <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontWeight: 600, color: "var(--text-main)", textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                    {formatBytes(r.size)}
                  </div>
                </div>
              </div>

              <a
                href={r.url}
                download={r.name}
                className={results.length === 1 ? "btn-primary" : "btn-secondary"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.55rem 1.2rem",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                  flexShrink: 0,
                }}
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download</span>
              </a>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onReset}
          className="btn-secondary"
          style={{ padding: "0.65rem 1.75rem" }}
        >
          {resetLabel}
        </button>
      </div>
    </div>
  );
}
