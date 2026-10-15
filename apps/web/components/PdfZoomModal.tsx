"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { renderPdfPage } from "../lib/pdfjs";

interface PdfZoomModalProps {
  readonly file: File | null;
  readonly pageNum?: number;
  readonly displayPageNum?: number;
  readonly angle?: number;
  readonly rotation?: number;
  readonly isProtected?: boolean;
  readonly onRotateLeft?: () => void;
  readonly onRotateRight?: () => void;
  readonly onClose: () => void;
}

export default function PdfZoomModal({
  file,
  pageNum = 1,
  angle = 0,
  rotation = 0,
  isProtected = false,
  onRotateLeft,
  onRotateRight,
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
    void renderPage();
  }, [renderPage]);

  // Keyboard navigation: Escape to close, Left/Right arrows to rotate
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && onRotateLeft && !isProtected) {
        onRotateLeft();
      } else if (e.key === "ArrowRight" && onRotateRight && !isProtected) {
        onRotateRight();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onRotateLeft, onRotateRight, isProtected]);

  if (!file) return null;

  const effectiveAngle = isProtected ? 0 : (angle || rotation || 0);
  const normAngle = ((effectiveAngle % 360) + 360) % 360;
  const isSideways = normAngle % 180 !== 0;
  const scaleRatio = isSideways ? 0.72 : 1;

  return (
    <div
      className="pdf-modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClose();
      }}
      role="button"
      tabIndex={0}
      aria-modal="true"
      aria-label="Page Preview"
    >
      <div
        className="pdf-zoom-clean-wrapper"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
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
            aria-hidden="true"
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

        {/* Floating Rotate controls if opened from rotate tool */}
        {onRotateLeft && onRotateRight && !isProtected && (
          <div
            style={{
              position: "absolute",
              top: "-52px",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(6px)",
              padding: "0.35rem 0.85rem",
              borderRadius: "9999px",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
              zIndex: 30,
            }}
          >
            <button
              type="button"
              onClick={onRotateLeft}
              title="Rotate Left (90° CCW)"
              aria-label="Rotate page left 90 degrees"
              style={{
                border: "none",
                background: "transparent",
                color: "var(--primary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                fontWeight: 700,
                fontSize: "0.8125rem",
              }}
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              <span>Rotate Left</span>
            </button>
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: 800,
                color: normAngle !== 0 ? "var(--primary)" : "var(--text-muted)",
                padding: "0 0.35rem",
                minWidth: "36px",
                textAlign: "center",
              }}
            >
              {normAngle}°
            </span>
            <button
              type="button"
              onClick={onRotateRight}
              title="Rotate Right (90° CW)"
              aria-label="Rotate page right 90 degrees"
              style={{
                border: "none",
                background: "transparent",
                color: "var(--primary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                fontWeight: 700,
                fontSize: "0.8125rem",
              }}
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>Rotate Right</span>
            </button>
          </div>
        )}

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
            transform: normAngle ? `rotate(${normAngle}deg) scale(${scaleRatio})` : undefined,
            transition: "transform 0.24s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>
    </div>
  );
}
