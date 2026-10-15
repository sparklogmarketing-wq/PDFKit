"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { renderPdfPage } from "../lib/pdfjs";

interface PdfZoomModalProps {
  file: File | null;
  pageNum?: number;
  displayPageNum?: number;
  angle?: number;
  isProtected?: boolean;
  onRotateLeft?: () => void;
  onRotateRight?: () => void;
  onClose: () => void;
}

export default function PdfZoomModal({
  file,
  pageNum = 1,
  displayPageNum,
  angle = 0,
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
      await renderPdfPage(file, canvasRef.current, pageNum, 1100);
    } finally {
      setLoading(false);
    }
  }, [file, pageNum]);

  useEffect(() => {
    renderPage();
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

  const effectiveAngle = isProtected ? 0 : angle;
  const normAngle = ((effectiveAngle % 360) + 360) % 360;
  const isSideways = normAngle % 180 !== 0;
  // Scale down slightly when rotated 90/270 sideways so it fits within the viewport completely
  const scaleRatio = isSideways ? 0.72 : 1;
  const displayNum = displayPageNum ?? pageNum;

  return (
    <div
      className="pdf-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${file.name} - Page ${displayNum}`}
    >
      <div
        className="pdf-modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "92vw",
          maxWidth: "960px",
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Modal Header: File info, page badge, rotation controls, and close */}
        <div className="pdf-modal-header" style={{ flexShrink: 0, padding: "0.75rem 1.25rem" }}>
          <div className="pdf-modal-fileinfo" style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
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
            <span
              style={{
                fontSize: "0.75rem",
                padding: "0.15rem 0.55rem",
                borderRadius: "9999px",
                background: isProtected ? "#fef3c7" : "var(--primary-subtle)",
                color: isProtected ? "#92400e" : "var(--primary)",
                border: `1px solid ${isProtected ? "#fde68a" : "var(--primary-border)"}`,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              Page {displayNum} {isProtected ? "(Kept Original)" : ""}
            </span>
          </div>

          <div className="pdf-modal-actions" style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
            {/* Left and Right Rotation Controls inside the Zoom Preview */}
            {onRotateLeft && onRotateRight && !isProtected && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <button
                  type="button"
                  onClick={onRotateLeft}
                  title="Rotate Left (90° CCW)"
                  style={{
                    padding: "0.35rem 0.65rem",
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    borderRadius: "6px",
                    border: "1px solid var(--border-light)",
                    background: "#ffffff",
                    color: "var(--primary)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  <span>Rotate Left</span>
                </button>

                <button
                  type="button"
                  onClick={onRotateRight}
                  title="Rotate Right (90° CW)"
                  style={{
                    padding: "0.35rem 0.65rem",
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    borderRadius: "6px",
                    border: "1px solid var(--border-light)",
                    background: "#ffffff",
                    color: "var(--primary)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    transition: "all 0.15s ease",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  <span>Rotate Right</span>
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
              </div>
            )}

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

        {/* Modal Body: Clean, no scrollers, responsive */}
        <div
          className="pdf-modal-body"
          style={{
            flex: 1,
            overflow: "hidden",
            padding: "1rem",
            background: "#f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            minHeight: 0,
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {loading && (
            <div className="pdf-modal-loading">
              <div className="spinner" />
              <span>Rendering preview...</span>
            </div>
          )}

          <div
            className="pdf-modal-canvas-wrapper"
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                transform: `rotate(${normAngle}deg) scale(${scaleRatio})`,
                transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                willChange: "transform",
              }}
            >
              <canvas
                ref={canvasRef}
                className="pdf-modal-canvas"
                style={{
                  maxWidth: "calc(88vw - 40px)",
                  maxHeight: "calc(80vh - 120px)",
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  boxShadow: "0 10px 35px rgba(0, 0, 0, 0.18)",
                  borderRadius: "6px",
                  display: "block",
                  background: "#ffffff",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
