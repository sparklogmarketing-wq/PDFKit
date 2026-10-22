"use client";

import { useEffect, useRef, useState } from "react";
import { renderPdfPage } from "../lib/pdfjs";
import { useInView } from "../lib/useInView";
import { formatBytes, formatPageCount } from "../lib/format";

interface PdfThumbnailCardProps {
  readonly file: File;
  readonly index: number;
  readonly numPages?: number | null;
  readonly isDragging: boolean;
  readonly isDropTarget: boolean;
  readonly disabled?: boolean;
  readonly isRotating?: boolean;
  readonly onDragStart: (e: React.DragEvent, index: number) => void;
  readonly onDragOver: (e: React.DragEvent, index: number) => void;
  readonly onDragEnter: (e: React.DragEvent, index: number) => void;
  readonly onDragLeave: (e: React.DragEvent, index: number) => void;
  readonly onDrop: (e: React.DragEvent, index: number) => void;
  readonly onDragEnd: () => void;
  readonly onZoom: (file: File, index: number) => void;
  readonly onRotate: (index: number) => void;
  readonly onRemove: (index: number) => void;
}

export default function PdfThumbnailCard({
  file,
  index,
  numPages: initialNumPages,
  isDragging,
  isDropTarget,
  disabled,
  isRotating,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  onZoom,
  onRotate,
  onRemove,
}: PdfThumbnailCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [numPages, setNumPages] = useState<number | null>(initialNumPages ?? null);
  const { ref: containerRef, isInView } = useInView<HTMLDivElement>({ rootMargin: "250px 0px" });
  const [hasRendered, setHasRendered] = useState(false);

  useEffect(() => {
    if (initialNumPages !== undefined && initialNumPages !== null) {
      setNumPages(initialNumPages);
    }
  }, [initialNumPages]);

  useEffect(() => {
    if (!isInView && !hasRendered) return;
    if (hasRendered) return;

    let active = true;
    const controller = new AbortController();
    setLoading(true);

    if (canvasRef.current) {
      void renderPdfPage(file, canvasRef.current, 1, 320, { signal: controller.signal })
        .then((res) => {
          if (!active) return;
          setLoading(false);
          if (res) {
            setHasRendered(true);
            if (res.numPages) {
              setNumPages(res.numPages);
            }
          }
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, [file, isInView, hasRendered]);

  return (
    <div
      ref={containerRef}
      className={`pdf-thumb-card ${isDragging ? "dragging" : ""} ${
        isDropTarget ? "drop-target" : ""
      }`}
      draggable={!disabled && !isRotating}
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
          {/* Rotate Button */}
          <button
            type="button"
            className={`pdf-thumb-action-btn rotate-btn ${isRotating ? "rotating" : ""}`}
            disabled={disabled || isRotating}
            onClick={(e) => {
              e.stopPropagation();
              onRotate(index);
            }}
            title="Rotate 90° clockwise"
            aria-label="Rotate PDF"
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
              <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>

          {/* Deduplicated Zoom In Button */}
          <button
            type="button"
            className="pdf-thumb-action-btn zoom-btn"
            onClick={(e) => {
              e.stopPropagation();
              onZoom(file, index);
            }}
            title="Zoom in / Preview page"
            aria-label="Zoom in"
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
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>

          {/* Remove / Delete Button */}
          <button
            type="button"
            className="pdf-thumb-action-btn delete-btn"
            disabled={disabled || isRotating}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(index);
            }}
            title="Remove from merge"
            aria-label="Remove"
          >
            &times;
          </button>
        </div>
      </div>

      {/* PDF Document Sheet Preview */}
      <div className="pdf-thumb-sheet-wrapper">
        <div className="pdf-thumb-sheet">
          {(loading || isRotating) && (
            <div className="pdf-thumb-skeleton">
              <div className="pdf-thumb-spinner" />
            </div>
          )}
          <canvas ref={canvasRef} className="pdf-thumb-canvas" />
        </div>
      </div>

      {/* File Meta Info */}
      <div className="pdf-thumb-footer">
        <span className="pdf-thumb-filename" title={file.name}>
          {file.name}
        </span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: "0.25rem" }}>
          <span className="pdf-thumb-pages-count">
            {formatPageCount(numPages)}
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
            {formatBytes(file.size)}
          </span>
        </div>
      </div>
    </div>
  );
}
