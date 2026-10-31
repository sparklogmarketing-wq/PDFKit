"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes } from "../lib/formatBytes";

export interface ImageZoomModalProps {
  readonly item: { readonly file: File; readonly previewUrl: string } | null;
  readonly pageIndex?: number;
  readonly onClose: () => void;
}

export default function ImageZoomModal({
  item,
  pageIndex,
  onClose,
}: ImageZoomModalProps) {
  const [scale, setScale] = useState(1);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // Capture triggering element before modal takes focus
  useEffect(() => {
    if (item && typeof document !== "undefined") {
      triggerElementRef.current = document.activeElement as HTMLElement | null;
    }
  }, [item]);

  // Reset zoom on new item
  useEffect(() => {
    if (item) setScale(1);
  }, [item]);

  // Focus trap, initial focus, focus restoration, scroll lock, and keyboard handling
  useEffect(() => {
    if (!item) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 30);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setScale((prev) => Math.min(3, Math.round((prev + 0.25) * 100) / 100));
        return;
      }

      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setScale((prev) => Math.max(0.5, Math.round((prev - 0.25) * 100) / 100));
        return;
      }

      if (e.key === "0") {
        e.preventDefault();
        setScale(1);
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      triggerElementRef.current?.focus();
    };
  }, [item, onClose]);

  if (!item) return null;

  const zoomPercent = Math.round(scale * 100);

  return (
    <div
      className="pdf-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Click outside to close button */}
      <button
        type="button"
        aria-label="Close zoomed view"
        tabIndex={-1}
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "transparent",
          border: "none",
          width: "100%",
          height: "100%",
          cursor: "default",
          zIndex: 0,
        }}
      />

      <dialog
        ref={dialogRef}
        open
        role="dialog"
        aria-modal="true"
        aria-labelledby="img-zoom-title"
        className="pdf-modal-container"
        style={{
          width: "92vw",
          maxWidth: "1000px",
          height: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          zIndex: 1,
          margin: "auto",
          padding: 0,
          background: "#ffffff",
          color: "inherit",
          border: "none",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
        }}
      >
        {/* Header */}
        <div
          className="pdf-modal-header"
          style={{
            flexShrink: 0,
            padding: "0.75rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--border)",
            background: "#fafafa",
          }}
        >
          {/* File info */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              minWidth: 0,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ color: "var(--primary)", flexShrink: 0 }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span
              id="img-zoom-title"
              style={{
                fontSize: "0.9375rem",
                fontWeight: 600,
                color: "var(--text-main)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "280px",
              }}
              title={item.file.name}
            >
              {item.file.name}
            </span>
            {pageIndex !== undefined && (
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.55rem",
                  borderRadius: "9999px",
                  background: "var(--primary-subtle)",
                  color: "var(--primary)",
                  border: "1px solid var(--primary-border, #ddd6fe)",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                Page {pageIndex + 1}
              </span>
            )}
            <span
              style={{
                fontSize: "0.75rem",
                padding: "0.15rem 0.55rem",
                borderRadius: "9999px",
                background: "var(--bg-muted, #f1f5f9)",
                color: "var(--text-secondary)",
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {formatBytes(item.file.size)}
            </span>
          </div>

          {/* Zoom controls & close */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#ffffff",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "2px",
                gap: "2px",
              }}
            >
              <button
                type="button"
                onClick={() => setScale((prev) => Math.max(0.5, Math.round((prev - 0.25) * 100) / 100))}
                disabled={scale <= 0.5}
                title="Zoom Out (-)"
                aria-label="Zoom Out"
                style={{
                  width: "28px",
                  height: "28px",
                  border: "none",
                  background: "transparent",
                  borderRadius: "4px",
                  cursor: scale <= 0.5 ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.1rem",
                  color: scale <= 0.5 ? "var(--text-muted)" : "var(--text-main)",
                }}
              >
                −
              </button>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  minWidth: "44px",
                  textAlign: "center",
                  userSelect: "none",
                }}
              >
                {zoomPercent}%
              </span>
              <button
                type="button"
                onClick={() => setScale((prev) => Math.min(3, Math.round((prev + 0.25) * 100) / 100))}
                disabled={scale >= 3}
                title="Zoom In (+)"
                aria-label="Zoom In"
                style={{
                  width: "28px",
                  height: "28px",
                  border: "none",
                  background: "transparent",
                  borderRadius: "4px",
                  cursor: scale >= 3 ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.1rem",
                  color: scale >= 3 ? "var(--text-muted)" : "var(--text-main)",
                }}
              >
                +
              </button>
              {scale !== 1 && (
                <button
                  type="button"
                  onClick={() => setScale(1)}
                  title="Reset Zoom (0)"
                  aria-label="Reset Zoom"
                  style={{
                    padding: "2px 6px",
                    border: "none",
                    background: "var(--bg-muted)",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  Reset
                </button>
              )}
            </div>

            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close zoomed view"
              className="pdf-modal-close-btn"
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                border: "1px solid var(--border)",
                background: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--text-main)",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body: Scrollable image preview */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
            padding: "1.5rem",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.previewUrl}
            alt={item.file.name}
            style={{
              maxWidth: scale <= 1 ? "100%" : "none",
              maxHeight: scale <= 1 ? "calc(90vh - 110px)" : "none",
              width: scale > 1 ? `${scale * 100}%` : "auto",
              height: "auto",
              objectFit: "contain",
              background: "#ffffff",
              borderRadius: "4px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
              border: "1px solid var(--border, #e2e8f0)",
              transition: "transform 0.15s ease",
            }}
          />
        </div>
      </dialog>
    </div>
  );
}
