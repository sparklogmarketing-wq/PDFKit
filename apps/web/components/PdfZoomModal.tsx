"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { renderPdfPage } from "../lib/pdfjs";

interface PdfZoomModalProps {
  file: File | null;
  pageNum?: number;
  rotation?: number;
  onClose: () => void;
}

export default function PdfZoomModal({
  file,
  pageNum = 1,
  rotation = 0,
  onClose,
}: PdfZoomModalProps) {
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderPage = useCallback(async () => {
    if (!file || !canvasRef.current) return;
    setLoading(true);
    try {
      // Render page at high resolution
      await renderPdfPage(file, canvasRef.current, pageNum, 1200);
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
      aria-label="Page Preview"
    >
      <div
        className="pdf-zoom-clean-wrapper"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Close Button */}
        <button
          type="button"
          className="pdf-zoom-close-btn"
          onClick={onClose}
          title="Close preview (Esc)"
          aria-label="Close"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Loading Spinner */}
        {loading && (
          <div className="pdf-modal-loading">
            <div className="spinner" />
            <span>Loading preview...</span>
          </div>
        )}

        {/* Pure Page Canvas */}
        <canvas
          ref={canvasRef}
          className="pdf-zoom-page-canvas"
          style={{
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            transition: "transform 0.2s ease",
          }}
        />
      </div>
    </div>
  );
}
