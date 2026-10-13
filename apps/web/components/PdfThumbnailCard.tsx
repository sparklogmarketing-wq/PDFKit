"use client";

import { useEffect, useRef, useState } from "react";
import { renderPdfPage, getPdfInfo } from "../lib/pdfjs";

interface PdfThumbnailCardProps {
  file: File;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  disabled?: boolean;
  isRotating?: boolean;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnter: (e: React.DragEvent, index: number) => void;
  onDragLeave: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onZoom: (file: File) => void;
  onRotate: (index: number) => void;
  onRemove: (index: number) => void;
}

export default function PdfThumbnailCard({
  file,
  index,
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
  const [numPages, setNumPages] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // Fetch page count immediately so it appears instantly under every card
    getPdfInfo(file).then((info) => {
      if (!active) return;
      if (info && info.numPages) {
        setNumPages(info.numPages);
      }
    });

    if (canvasRef.current) {
      renderPdfPage(file, canvasRef.current, 1, 320).then((res) => {
        if (!active) return;
        setLoading(false);
        if (res && res.numPages) {
          setNumPages(res.numPages);
        }
      });
    }

    return () => {
      active = false;
    };
  }, [file]);

  return (
    <div
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
              onZoom(file);
            }}
            title="Zoom in / Preview page"
            aria-label="Zoom in"
          >
            <svg
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

      {/* PDF Document Sheet Preview (Clean preview with no hover overlay) */}
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
        <span className="pdf-thumb-pages-count">
          {numPages !== null ? `${numPages} ${numPages === 1 ? "page" : "pages"}` : "1 page"}
        </span>
      </div>
    </div>
  );
}
