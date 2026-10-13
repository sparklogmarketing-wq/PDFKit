"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { renderPdfPage } from "../lib/pdfjs";

interface PdfZoomModalProps {
  file: File | null;
  pageNum?: number;
  onClose: () => void;
}

export default function PdfZoomModal({ file, pageNum = 1, onClose }: PdfZoomModalProps) {
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderPage = useCallback(async () => {
    if (!file || !canvasRef.current) return;
    setLoading(true);
    try {
      // Render page at high resolution
      await renderPdfPage(file, canvasRef.current, pageNum, 1000);
    } finally {
      setLoading(false);
    }
  }, [file, pageNum]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!file) return null;

  return (
    <div
      className="pdf-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${file.name}`}
    >
      <div className="pdf-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header: File info & Close button only */}
        <div className="pdf-modal-header">
          <div className="pdf-modal-fileinfo">
            <svg
              className="pdf-modal-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="pdf-modal-filename" title={file.name}>
              {file.name}
            </span>
          </div>

          <div className="pdf-modal-actions">
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              title="Close preview (Esc)"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Modal Body: Full First Page at a glance without scrolling */}
        <div className="pdf-modal-body">
          {loading && (
            <div className="pdf-modal-loading">
              <div className="spinner" />
              <span>Rendering preview...</span>
            </div>
          )}
          <div className="pdf-modal-canvas-wrapper">
            <canvas ref={canvasRef} className="pdf-modal-canvas" />
          </div>
        </div>
      </div>
    </div>
  );
}
