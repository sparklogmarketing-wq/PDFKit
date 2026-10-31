"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { runTool, isCancelledError } from "../lib/runTool";
import { useZipDownload } from "../lib/downloadZip";
import { formatBytes } from "../lib/formatBytes";
import { uint8ArrayToBlob } from "../lib/format";
import { validateFilesForUpload } from "../lib/limits";
import PdfDropzone from "./PdfDropzone";
import ImageZoomModal from "./ImageZoomModal";
import type { OutputFile } from "@pdfkit/core";

export interface ImageFileItem {
  readonly id: string;
  readonly file: File;
  readonly previewUrl: string;
}

async function convertImageToStandardJpg(file: File): Promise<Uint8Array<ArrayBuffer> | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          async (blob) => {
            if (!blob) return resolve(null);
            const ab = await blob.arrayBuffer();
            resolve(new Uint8Array(ab) as Uint8Array<ArrayBuffer>);
          },
          "image/jpeg",
          0.95
        );
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export default function JpgToPdfTool() {
  const [items, setItems] = useState<ImageFileItem[]>([]);
  const [pageSize, setPageSize] = useState<"a4" | "letter" | "fit">("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [margin, setMargin] = useState<"none" | "small" | "large">("none");
  const [mergeAll, setMergeAll] = useState(true);

  const [isDragging, setIsDragging] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [zoomItem, setZoomItem] = useState<{ item: ImageFileItem; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ name: string; url: string; size: number }[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const { isZipping, zipError, downloadZip } = useZipDownload();

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      cancelRef.current?.();
      items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
      results?.forEach((r) => URL.revokeObjectURL(r.url));
    };
  }, [items, results]);

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      setError(null);
      const validImages = Array.from(newFiles).filter((f) => {
        const type = f.type.toLowerCase();
        const name = f.name.toLowerCase();
        return (
          type === "image/png" ||
          type === "image/jpeg" ||
          type === "image/jpg" ||
          name.endsWith(".png") ||
          name.endsWith(".jpg") ||
          name.endsWith(".jpeg")
        );
      });

      if (validImages.length === 0) {
        setError("Please select image files (JPG or PNG).");
        return;
      }

      const validation = validateFilesForUpload(
        validImages,
        items.map((it) => it.file)
      );
      if (validation.error) {
        setError(validation.error);
        return;
      }

      const newItems: ImageFileItem[] = validImages.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      setItems((prev) => [...prev, ...newItems]);
    },
    [items]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  }, []);

  const handleCardDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${index}`);
  };

  const handleCardDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx !== index) {
      setDragOverIdx(index);
    }
  };

  const handleCardDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIdx(index);
  };

  const handleCardDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIdx !== null && draggedIdx !== dropIndex) {
      setItems((prev) => {
        const next = [...prev];
        const [moved] = next.splice(draggedIdx, 1);
        next.splice(dropIndex, 0, moved);
        return next;
      });
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleCardDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (draggedIdx === null && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [draggedIdx, addFiles]
  );

  const clearAll = useCallback(() => {
    cancelRef.current?.();
    items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    setItems([]);
    setResults(null);
    setError(null);
    setProgress(0);
    setIsProcessing(false);
  }, [items]);

  const handleConvert = async () => {
    if (items.length === 0) return;
    setError(null);
    setIsProcessing(true);
    setProgress(5);

    try {
      const inputs = await Promise.all(
        items.map(async (item) => {
          let bytes = new Uint8Array(await item.file.arrayBuffer());
          const isJpg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
          const isPng =
            bytes.length >= 4 &&
            bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47;

          // If not a standard JPEG or PNG (e.g. WebP, AVIF, or image with corrupted SOI header),
          // normalize via browser canvas to guarantee a standard JPEG stream starting with 0xFF 0xD8
          if (!isJpg && !isPng && typeof window !== "undefined") {
            try {
              const converted = await convertImageToStandardJpg(item.file);
              if (converted) {
                bytes = converted;
              }
            } catch {
              // fallback to raw bytes
            }
          }

          return {
            name: item.file.name,
            data: bytes,
          };
        })
      );

      const job = runTool(
        "jpg-to-pdf",
        inputs,
        {
          pageSize,
          orientation,
          margin,
          mergeAll,
        },
        (p) => setProgress(Math.round(p * 100))
      );

      cancelRef.current = job.cancel;
      const outFiles: OutputFile[] = await job.promise;

      const generated = outFiles.map((f) => {
        const blob = uint8ArrayToBlob(f.data, f.mime);
        return {
          name: f.name,
          url: URL.createObjectURL(blob),
          size: f.data.byteLength,
        };
      });

      setResults(generated);
      setIsProcessing(false);
      setProgress(100);
    } catch (err: any) {
      if (!isCancelledError(err)) {
        setError(err?.message || "Failed to convert images to PDF.");
      }
      setIsProcessing(false);
      setProgress(0);
    } finally {
      cancelRef.current = null;
    }
  };

  const handleCancel = () => {
    cancelRef.current?.();
    setIsProcessing(false);
    setProgress(0);
  };

  const sheetOrientationClass = useMemo(() => {
    if (pageSize === "fit") return "img2pdf-sheet--fit";
    return orientation === "landscape"
      ? "img2pdf-sheet--landscape"
      : "img2pdf-sheet--portrait";
  }, [pageSize, orientation]);

  const sheetInnerMarginClass = useMemo(() => {
    if (margin === "small") return "img2pdf-sheet-inner--small";
    if (margin === "large") return "img2pdf-sheet-inner--large";
    return "img2pdf-sheet-inner--none";
  }, [margin]);

  /* ── 1. Empty Dropzone View (BEFORE UPLOAD: NO OPTIONS SHOWN) ── */
  if (items.length === 0 && !results) {
    return (
      <div className="tool-runner-panel workspace-empty-panel">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <PdfDropzone
          isDragging={isDragging}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          primaryText="Choose Image files, or drag and drop here"
          badgeText="Multiple files (.jpg, .jpeg, .png)"
        />

        {error && (
          <div className="alert-error workspace-alert" role="alert">
            {error}
          </div>
        )}
      </div>
    );
  }

  /* ── 2. Results Success View ────────────────────────────────── */
  if (results) {
    const isSingle = results.length === 1;
    return (
      <div className="tool-runner-panel" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--primary-subtle)",
            color: "var(--primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.5rem" }}>
          Images Converted to PDF!
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", fontSize: "0.95rem" }}>
          {isSingle
            ? "Your PDF document is ready for download."
            : `${results.length} separate PDF files were successfully generated.`}
        </p>

        {zipError && (
          <div role="alert" className="alert-error" style={{ maxWidth: 460, margin: "0 auto 1.5rem" }}>
            <div>{zipError}</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 360, margin: "0 auto" }}>
          {isSingle ? (
            <a
              href={results[0].url}
              download={results[0].name}
              className="btn btn-primary"
              style={{ padding: "0.875rem 1.5rem", fontSize: "1rem", textAlign: "center" }}
            >
              Download PDF ({formatBytes(results[0].size)})
            </a>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: "0.875rem 1.5rem", fontSize: "1rem" }}
                disabled={isZipping}
                onClick={() => downloadZip(results, "converted_pdfs.zip")}
              >
                {isZipping ? "Creating ZIP…" : "Download All (ZIP)"}
              </button>
              {results.map((r) => (
                <a
                  key={r.name}
                  href={r.url}
                  download={r.name}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.875rem", justifyContent: "space-between" }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.name}
                  </span>
                  <span style={{ color: "var(--text-muted)", marginLeft: "0.5rem" }}>
                    {formatBytes(r.size)}
                  </span>
                </a>
              ))}
            </>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: "0.5rem" }}
            onClick={clearAll}
          >
            Convert More Images
          </button>
        </div>
      </div>
    );
  }

  /* ── 3. Interactive Studio (2-COLUMN LAYOUT MATCHING USER IMAGE) ── */
  return (
    <div className="img2pdf-workspace">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* LEFT CANVAS: Realistic sheets layout */}
      <div
        className="img2pdf-canvas"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleCanvasDrop}
      >
        {/* Floating add button in top right corner */}
        <button
          type="button"
          className="img2pdf-floating-add"
          onClick={() => fileInputRef.current?.click()}
          title="Add more images"
          aria-label="Add more images"
        >
          <span className="img2pdf-floating-badge">{items.length}</span>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Sheets representing pages */}
        <div className="img2pdf-sheets-grid">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className={`img2pdf-sheet-wrapper ${draggedIdx === idx ? "dragging" : ""} ${
                dragOverIdx === idx && draggedIdx !== idx ? "drop-target" : ""
              }`}
              draggable
              onDragStart={(e) => handleCardDragStart(e, idx)}
              onDragOver={(e) => handleCardDragOver(e, idx)}
              onDragEnter={(e) => handleCardDragEnter(e, idx)}
              onDrop={(e) => handleCardDrop(e, idx)}
              onDragEnd={handleCardDragEnd}
            >
              <div className={`img2pdf-sheet ${sheetOrientationClass}`}>
                <div className={`img2pdf-sheet-inner ${sheetInnerMarginClass}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="img2pdf-sheet-img"
                    draggable={false}
                  />
                </div>

                {/* Hover controls on sheet */}
                <div className="img2pdf-sheet-overlay">
                  <button
                    type="button"
                    className="img2pdf-sheet-btn"
                    title="Zoom image"
                    aria-label={`Zoom ${item.file.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomItem({ item, index: idx });
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="11" y1="8" x2="11" y2="14" />
                      <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="img2pdf-sheet-btn img2pdf-sheet-btn--delete"
                    title="Remove image"
                    aria-label={`Remove ${item.file.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(item.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="img2pdf-sheet-caption" title={item.file.name}>
                <span className="img2pdf-page-badge">Page {idx + 1}</span>
                <span>{item.file.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT SIDEBAR: "Image to PDF options" */}
      <aside className="img2pdf-sidebar" aria-label="Image to PDF options">
        <h3 className="img2pdf-sidebar-title">Image to PDF options</h3>

        {/* Section 1: Page Orientation */}
        <div className="img2pdf-option-group">
          <span className="img2pdf-option-label">Page orientation</span>
          <div className="img2pdf-btn-grid-2" role="radiogroup" aria-label="Page orientation">
            <button
              type="button"
              role="radio"
              aria-checked={orientation === "portrait"}
              className={`img2pdf-toggle-card ${orientation === "portrait" ? "active" : ""}`}
              onClick={() => setOrientation("portrait")}
            >
              <svg
                width="20"
                height="28"
                viewBox="0 0 16 22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="12" height="18" rx="2" />
              </svg>
              <span>Portrait</span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={orientation === "landscape"}
              className={`img2pdf-toggle-card ${orientation === "landscape" ? "active" : ""}`}
              onClick={() => setOrientation("landscape")}
            >
              <svg
                width="28"
                height="20"
                viewBox="0 0 22 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="18" height="12" rx="2" />
              </svg>
              <span>Landscape</span>
            </button>
          </div>
        </div>

        {/* Section 2: Page Size */}
        <div className="img2pdf-option-group">
          <label htmlFor="img2pdf-size-select" className="img2pdf-option-label">
            Page size
          </label>
          <select
            id="img2pdf-size-select"
            className="img2pdf-select"
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value as any)}
          >
            <option value="a4">A4 (297x210 mm)</option>
            <option value="letter">US Letter (215x279 mm)</option>
            <option value="fit">Fit (same page size as image)</option>
          </select>
        </div>

        {/* Section 3: Margin */}
        <div className="img2pdf-option-group">
          <span className="img2pdf-option-label">Margin</span>
          <div className="img2pdf-btn-grid-3" role="radiogroup" aria-label="Margin size">
            {/* No Margin */}
            <button
              type="button"
              role="radio"
              aria-checked={margin === "none"}
              className={`img2pdf-toggle-card ${margin === "none" ? "active" : ""}`}
              onClick={() => setMargin("none")}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <circle cx="8" cy="8" r="1.5" />
                <polyline points="21 16 16 11 3 21" />
              </svg>
              <span>No margin</span>
            </button>

            {/* Small Margin */}
            <button
              type="button"
              role="radio"
              aria-checked={margin === "small"}
              className={`img2pdf-toggle-card ${margin === "small" ? "active" : ""}`}
              onClick={() => setMargin("small")}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="20" height="20" rx="2" strokeDasharray="2 2" />
                <rect x="5" y="5" width="14" height="14" rx="1.5" />
              </svg>
              <span>Small</span>
            </button>

            {/* Big Margin */}
            <button
              type="button"
              role="radio"
              aria-checked={margin === "large"}
              className={`img2pdf-toggle-card ${margin === "large" ? "active" : ""}`}
              onClick={() => setMargin("large")}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="20" height="20" rx="2" strokeDasharray="2 2" />
                <rect x="8" y="8" width="8" height="8" rx="1" />
              </svg>
              <span>Big</span>
            </button>
          </div>
        </div>

        {/* Section 4: Merge option */}
        <div className="img2pdf-option-group" style={{ marginTop: "0.25rem" }}>
          <label className="img2pdf-checkbox-label">
            <input
              type="checkbox"
              className="img2pdf-checkbox-input"
              checked={mergeAll}
              onChange={(e) => setMergeAll(e.target.checked)}
            />
            <span>Merge all images in one PDF file</span>
          </label>
        </div>

        {error && (
          <div className="alert-error" style={{ fontSize: "0.8rem", padding: "0.5rem" }}>
            {error}
          </div>
        )}

        {/* Section 5: Convert Action Button */}
        {isProcessing ? (
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
              <span>Converting…</span>
              <span>{progress}%</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="img2pdf-convert-btn"
            onClick={handleConvert}
          >
            <span>Convert to PDF</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 8 16 12 12 16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>
        )}
      </aside>

      {/* Image Zoom Lightbox Modal */}
      {zoomItem && (
        <ImageZoomModal
          item={zoomItem.item}
          pageIndex={zoomItem.index}
          onClose={() => setZoomItem(null)}
        />
      )}
    </div>
  );
}
