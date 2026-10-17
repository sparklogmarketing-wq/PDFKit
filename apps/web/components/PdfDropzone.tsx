"use client";

interface PdfDropzoneProps {
  readonly isDragging: boolean;
  readonly onDragOver: (e: React.DragEvent) => void;
  readonly onDragLeave: (e: React.DragEvent) => void;
  readonly onDrop: (e: React.DragEvent) => void;
  readonly onClick: () => void;
  readonly isCompact?: boolean;
  readonly primaryText?: string;
  readonly badgeText?: string;
}

export default function PdfDropzone({
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  isCompact = false,
  primaryText,
  badgeText,
}: PdfDropzoneProps) {
  if (isCompact) {
    return (
      <div className="dropzone-container" style={{ marginBottom: "1.25rem" }}>
        <button
          type="button"
          className={`dropzone ${isDragging ? "active" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onClick}
          style={{ padding: "1.25rem", minHeight: "auto", width: "100%", cursor: "pointer" }}
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
            {primaryText ?? "Click or drop more files to add"}
          </p>
          {badgeText && (
            <span className="dropzone-badge" style={{ margin: 0 }}>
              {badgeText}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="dropzone-container">
      <button
        type="button"
        className={`dropzone ${isDragging ? "active" : ""}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
        style={{ width: "100%", cursor: "pointer" }}
      >
        <svg aria-hidden="true" className="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>

        <p className="dropzone-text-primary">
          {primaryText ?? "Choose PDF files, or drag and drop here"}
        </p>
        <span className="dropzone-badge">
          {badgeText ?? "Multiple files (.pdf)"}
        </span>
      </button>
    </div>
  );
}
