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
    <div className="tool-runner-panel tool-results-panel">
      <div className="tool-results-card">
        <div className="tool-results-icon-badge">
          <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>

        <h2 className="tool-results-title">
          {title}
        </h2>
        <p className="tool-results-subtitle">
          {subtitle}
        </p>

        {error && (
          <div
            role="alert"
            className="alert-error tool-results-alert"
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
          <div className="tool-results-zip-wrapper">
            <button
              type="button"
              onClick={onDownloadZip}
              disabled={isZipping}
              className="btn-primary tool-results-zip-btn"
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

        <div className={`tool-results-file-list ${results.length === 1 ? "single-file" : ""}`}>
          {results.map((r, i) => (
            <div
              key={`${r.name}-${i}`}
              className="tool-results-file-item"
            >
              <div className="tool-results-file-info">
                <div className="tool-results-file-icon">
                  <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="tool-results-file-details">
                  <div
                    className="tool-results-file-name"
                    title={r.name}
                  >
                    {r.name}
                  </div>
                  <div className="tool-results-file-size">
                    {formatBytes(r.size)}
                  </div>
                </div>
              </div>

              <a
                href={r.url}
                download={r.name}
                className={`${results.length === 1 ? "btn-primary" : "btn-secondary"} tool-results-download-btn`}
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

        <div className="tool-results-actions">
          <button
            type="button"
            onClick={onReset}
            className="btn-secondary tool-results-reset-btn"
          >
            {resetLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
