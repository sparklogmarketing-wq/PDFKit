"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { renderPdfPage, getPdfInfo } from "../lib/pdfjs";
import { validateFilesForUpload, getPayloadMemoryWarning } from "../lib/limits";
import { usePdfThumbnail } from "../lib/usePdfThumbnail";
import { runTool, isCancelledError } from "../lib/runTool";
import { formatBytes } from "../lib/formatBytes";
import { generateUUID, uint8ArrayToBlob } from "../lib/format";
import PdfZoomModal from "./PdfZoomModal";
import type { OutputFile } from "@pdfkit/core";
import { reinsertBlanksAtRelativePositions } from "@pdfkit/mod-organize";

/* ── Color Themes for files matching iLovePDF ─────────────── */
export interface ColorTheme {
  bg: string;
  border: string;
  badgeBg: string;
  text: string;
  lightBg: string;
}

export const FILE_PALETTES: ColorTheme[] = [
  { bg: "#fee2e2", border: "#fca5a5", badgeBg: "#fecaca", text: "#991b1b", lightBg: "#fff5f5" }, // Pink/Red
  { bg: "#ccfbf1", border: "#5eead4", badgeBg: "#99f6e4", text: "#0f766e", lightBg: "#f0fdfa" }, // Teal
  { bg: "#fef9c3", border: "#fde047", badgeBg: "#fef08a", text: "#854d0e", lightBg: "#fefce8" }, // Yellow
  { bg: "#e0e7ff", border: "#a5b4fc", badgeBg: "#c7d2fe", text: "#3730a3", lightBg: "#eef2ff" }, // Purple/Indigo
  { bg: "#dcfce7", border: "#86efac", badgeBg: "#bbf7d0", text: "#166534", lightBg: "#f0fdf4" }, // Green
  { bg: "#ffedd5", border: "#fdba74", badgeBg: "#fed7aa", text: "#9a3412", lightBg: "#fff7ed" }, // Orange
  { bg: "#f3e8ff", border: "#d8b4fe", badgeBg: "#e9d5ff", text: "#6b21a8", lightBg: "#faf5ff" }, // Violet
  { bg: "#e0f2fe", border: "#7dd3fc", badgeBg: "#bae6fd", text: "#075985", lightBg: "#f0f9ff" }, // Sky
];

export interface FileEntry {
  id: string;
  file: File;
  letter: string;
  theme: ColorTheme;
  totalPages: number;
}

export interface PageItem {
  id: string; // unique page key
  fileId: string;
  fileIndex: number;
  pageIndex: number; // 0-indexed original page
  rotation: number; // 0, 90, 180, 270
  isBlank?: boolean;
  width?: number;
  height?: number;
}

interface OrganizePageCardProps {
  readonly item: PageItem;
  readonly seqNumber: number;
  readonly theme?: ColorTheme;
  readonly file?: File;
  readonly isDragging: boolean;
  readonly isDropTarget: boolean;
  readonly canMoveLeft?: boolean;
  readonly canMoveRight?: boolean;
  readonly onMoveLeft?: () => void;
  readonly onMoveRight?: () => void;
  readonly onRotate: () => void;
  readonly onDelete: () => void;
  readonly onZoom: () => void;
  readonly onDragStart: (e: React.DragEvent) => void;
  readonly onDragOver: (e: React.DragEvent) => void;
  readonly onDragEnter: (e: React.DragEvent) => void;
  readonly onDragLeave: (e: React.DragEvent) => void;
  readonly onDrop: (e: React.DragEvent) => void;
  readonly onDragEnd: (e: React.DragEvent) => void;
  readonly onInsertBlank: () => void;
  readonly onInsertPdfClick: () => void;
}

/* ── Page Card Component ─────────────────────────────────── */
function OrganizePageCard({
  item,
  seqNumber,
  theme,
  file,
  isDragging,
  isDropTarget,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  onRotate,
  onDelete,
  onZoom,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  onInsertBlank,
  onInsertPdfClick,
}: OrganizePageCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { canvasRef, containerRef, loading } = usePdfThumbnail({
    file,
    pageNum: item.pageIndex + 1,
    targetWidth: 180,
    rootMargin: "300px 0px",
    enabled: !item.isBlank,
  });

  const cardBorder = theme?.border || "#cbd5e1";

  return (
    <div
      ref={containerRef}
      className={`organize-page-wrapper ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
      draggable
      tabIndex={0}
      role="group"
      aria-label={`Page ${seqNumber}, ${item.isBlank ? "blank page" : "document page"}`}
      onKeyDown={(e) => {
        if (e.altKey && e.key === "ArrowLeft" && canMoveLeft) {
          e.preventDefault();
          onMoveLeft?.();
        } else if (e.altKey && e.key === "ArrowRight" && canMoveRight) {
          e.preventDefault();
          onMoveRight?.();
        }
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Insert Plus Pill between cards */}
      <div className="organize-insert-container">
        <button
          type="button"
          className="organize-insert-btn"
          title="Insert page here"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((prev) => !prev);
          }}
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </button>

        {menuOpen && (
          <div className="organize-insert-menu">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onInsertBlank();
              }}
            >
              + Add blank page
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onInsertPdfClick();
              }}
            >
              + Insert PDF…
            </button>
          </div>
        )}
      </div>

      {/* Main Page Card */}
      <div
        className="organize-page-card"
        style={{
          border: `6px solid ${cardBorder}`,
        }}
      >
        {/* Card Top Action Icons */}
        <div className="organize-card-top-actions">
          <button
            type="button"
            className="organize-icon-btn move-left"
            disabled={!canMoveLeft}
            title={canMoveLeft ? "Move page earlier (Alt+Left)" : "Cannot move earlier"}
            aria-label={`Move page ${seqNumber} earlier`}
            onClick={(e) => {
              e.stopPropagation();
              onMoveLeft?.();
            }}
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <button
            type="button"
            className="organize-icon-btn move-right"
            disabled={!canMoveRight}
            title={canMoveRight ? "Move page later (Alt+Right)" : "Cannot move later"}
            aria-label={`Move page ${seqNumber} later`}
            onClick={(e) => {
              e.stopPropagation();
              onMoveRight?.();
            }}
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {!item.isBlank && (
            <button
              type="button"
              className="organize-icon-btn zoom"
              title="Zoom page"
              aria-label={`Zoom page ${seqNumber}`}
              onClick={(e) => {
                e.stopPropagation();
                onZoom();
              }}
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
          )}

          <button
            type="button"
            className="organize-icon-btn rotate"
            title="Rotate clockwise"
            onClick={(e) => {
              e.stopPropagation();
              onRotate();
            }}
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6" />
              <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>

          <button
            type="button"
            className="organize-icon-btn delete"
            title="Delete page"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Thumbnail Canvas Area */}
        <div
          className="organize-page-sheet"
          onClick={(e) => {
            if (!item.isBlank) {
              e.stopPropagation();
              onZoom();
            }
          }}
          onKeyDown={(e) => {
            if (!item.isBlank && (e.key === "Enter" || e.key === " ")) {
              e.stopPropagation();
              onZoom();
            }
          }}
          role={item.isBlank ? undefined : "button"}
          tabIndex={item.isBlank ? undefined : 0}
          style={{ cursor: item.isBlank ? "default" : "pointer" }}
          title={item.isBlank ? "" : "Click to preview page"}
          aria-label={item.isBlank ? undefined : `Preview page ${seqNumber}`}
        >
          {item.isBlank ? (
            <div
              className="organize-blank-sheet"
              style={{
                transform: `rotate(${item.rotation}deg)`,
                transition: "transform 0.2s ease",
              }}
            >
              <span>Blank page</span>
            </div>
          ) : (
            <>
              {loading && (
                <div className="pdf-thumb-skeleton">
                  <div className="pdf-thumb-spinner" />
                </div>
              )}
              <canvas
                ref={canvasRef}
                className="organize-canvas"
                style={{
                  transform: `rotate(${item.rotation}deg)`,
                  transition: "transform 0.2s ease",
                }}
              />
            </>
          )}
        </div>

        {/* Bottom Page Number Badge */}
        <div className="organize-page-num-badge">
          {seqNumber}
        </div>
      </div>
    </div>
  );
}

function handleCardDragLeave(e: React.DragEvent) {
  e.preventDefault();
  e.stopPropagation();
}

export function resequencePagesForFiles(
  orderedFiles: FileEntry[],
  currentPages: PageItem[]
): { reLetteredFiles: FileEntry[]; updatedPages: PageItem[] } {
  const reLetteredFiles = orderedFiles.map((entry, idx) => ({
    ...entry,
    letter: String.fromCodePoint(65 + (idx % 26)),
    theme: FILE_PALETTES[idx % FILE_PALETTES.length],
  }));

  const pagesByFile = new Map<string, PageItem[]>();
  for (const f of reLetteredFiles) {
    pagesByFile.set(f.id, []);
  }

  for (const p of currentPages) {
    if (!p.isBlank && pagesByFile.has(p.fileId)) {
      const fileList = pagesByFile.get(p.fileId);
      if (fileList) {
        fileList.push(p);
      }
    }
  }

  const reorderedNonBlanks: PageItem[] = [];
  reLetteredFiles.forEach((fileEntry, newFileIdx) => {
    const filePages = pagesByFile.get(fileEntry.id) || [];
    filePages.forEach((p) => {
      reorderedNonBlanks.push({
        ...p,
        fileIndex: newFileIdx,
      });
    });
  });

  const updatedPages = reinsertBlanksAtRelativePositions(currentPages, reorderedNonBlanks);
  return { reLetteredFiles, updatedPages };
}

/* ── Main Organize Tool Component ─────────────────────────── */
export default function OrganizeTool() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);
  const insertIndexRef = useRef<number | null>(null);

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  /* Card reordering drag state */
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);
  const [dragOverPageIndex, setDragOverPageIndex] = useState<number | null>(null);

  /* Sidebar file chips reordering drag state */
  const [draggedFileIdx, setDraggedFileIdx] = useState<number | null>(null);
  const [dragOverFileIdx, setDragOverFileIdx] = useState<number | null>(null);

  /* Toolbar sorting direction states */
  const [sortAlphaDir, setSortAlphaDir] = useState<"A-Z" | "Z-A">("A-Z");
  const [sortNumDir, setSortNumDir] = useState<"1-9" | "9-1">("1-9");

  /* Zoom modal */
  const [zoomPageInfo, setZoomPageInfo] = useState<{ file: File; pageNum: number; rotation?: number } | null>(null);

  /* Execution state */
  const [progress, setProgress] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<{ name: string; url: string; size: number }[]>([]);
  const [cancel, setCancel] = useState<(() => void) | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  cancelRef.current = cancel;
  const loadIdRef = useRef(0);
  const runIdRef = useRef(0);

  const isRunning = progress !== null;
  const hasRealPages = pages.some((p) => !p.isBlank);
  const memoryWarning = useMemo(() => getPayloadMemoryWarning(files.map((f) => f.file)), [files]);

  /* Cleanup URLs and cancel active job on unmount */
  useEffect(() => {
    return () => {
      cancelRef.current?.();
      results.forEach((r) => URL.revokeObjectURL(r.url));
    };
  }, [results]);

  /* ── Load Initial or Appended Files ─────────────────────── */
  const loadFiles = useCallback(
    async (newFilesList: FileList | File[], insertAtPageIndex?: number) => {
      const arr = Array.from(newFilesList).filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );
      if (arr.length === 0) {
        setError("Please select valid PDF files.");
        return;
      }

      const existingFiles = files.map((entry) => entry.file);
      const validation = validateFilesForUpload(arr, existingFiles);
      if (validation.error) {
        setError(validation.error);
        return;
      }
      setError("");

      const loadId = ++loadIdRef.current;
      const newEntries: FileEntry[] = [];
      const newPagesList: PageItem[] = [];
      const fileInfos = await Promise.all(arr.map((file) => getPdfInfo(file)));
      if (loadId !== loadIdRef.current) return;

      for (let i = 0; i < arr.length; i++) {
        const file = arr[i];
        const letter = String.fromCodePoint(65 + ((files.length + i) % 26));
        const theme = FILE_PALETTES[(files.length + i) % FILE_PALETTES.length];
        const info = fileInfos[i];
        const total = info?.numPages || 1;
        const fileId = `f-${generateUUID()}`;

        const entry: FileEntry = {
          id: fileId,
          file,
          letter,
          theme,
          totalPages: total,
        };
        newEntries.push(entry);

        const currentFileIndex = files.length + i;
        for (let p = 0; p < total; p++) {
          newPagesList.push({
            id: `p-${fileId}-${p}-${generateUUID()}`,
            fileId,
            fileIndex: currentFileIndex,
            pageIndex: p,
            rotation: 0,
          });
        }
      }

      setFiles((prev) => [...prev, ...newEntries]);

      setPages((prev) => {
        if (typeof insertAtPageIndex === "number" && insertAtPageIndex >= 0 && insertAtPageIndex <= prev.length) {
          const next = [...prev];
          next.splice(insertAtPageIndex, 0, ...newPagesList);
          return next;
        }
        return [...prev, ...newPagesList];
      });
    },
    [files.length]
  );

  function handleInitialDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void loadFiles(e.dataTransfer.files);
    }
  }

  /* ── Page Card Actions ───────────────────────────────────── */
  function handleRotatePage(pageIdx: number) {
    setPages((prev) => {
      const next = [...prev];
      const cur = next[pageIdx];
      if (cur) {
        next[pageIdx] = { ...cur, rotation: (cur.rotation + 90) % 360 };
      }
      return next;
    });
  }

  function handleDeletePage(pageIdx: number) {
    if (pages.length <= 1) {
      setError("A PDF document must have at least one page.");
      return;
    }
    const remaining = pages.filter((_, idx) => idx !== pageIdx);
    if (!remaining.some((p) => !p.isBlank)) {
      setError("At least one real page is required.");
    } else {
      setError("");
    }
    setPages(remaining);
  }

  function handleInsertBlank(insertAt: number) {
    const blankItem: PageItem = {
      id: `blank-${generateUUID()}`,
      fileId: "blank",
      fileIndex: -1,
      pageIndex: -1,
      rotation: 0,
      isBlank: true,
    };
    setPages((prev) => {
      const next = [...prev];
      next.splice(insertAt, 0, blankItem);
      return next;
    });
  }

  function handleInsertPdfPrompt(insertAt: number) {
    insertIndexRef.current = insertAt;
    appendFileInputRef.current?.click();
  }

  /* ── Drag & Drop Card Reordering ────────────────────────── */
  function handleCardDragStart(e: React.DragEvent, index: number) {
    setDraggedPageIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  }

  function handleCardDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragOverPageIndex !== index) {
      setDragOverPageIndex(index);
    }
  }

  function handleCardDragEnter(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPageIndex(index);
  }

  function handleMovePage(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= pages.length || fromIndex === toIndex) return;
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleCardDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    const sourceIndex = draggedPageIndex;
    if (sourceIndex !== null && sourceIndex !== dropIndex) {
      handleMovePage(sourceIndex, dropIndex);
    }
    setDraggedPageIndex(null);
    setDragOverPageIndex(null);
  }

  function handleCardDragEnd() {
    setDraggedPageIndex(null);
    setDragOverPageIndex(null);
  }

  /* ── Toolbar Sorting Functions ──────────────────────────── */
  // 1. Sort A-Z / Z-A: Sort files alphabetically by filename, group pages by file
  function handleSortAlphabetical() {
    if (files.length <= 1) return;

    const isAsc = sortAlphaDir === "A-Z";

    // Sort files by filename
    const sortedFiles = [...files].sort((a, b) => {
      const cmp = a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: "base" });
      return isAsc ? cmp : -cmp;
    });

    const { reLetteredFiles, updatedPages } = resequencePagesForFiles(sortedFiles, pages);
    setFiles(reLetteredFiles);
    setPages(updatedPages);
    setSortAlphaDir(isAsc ? "Z-A" : "A-Z");
  }

  // 2. Sort 1-9 / 9-1: Natural vs Reverse page order
  function handleNumericSort() {
    setPages((prev) => {
      const nonBlank = prev.filter((p) => !p.isBlank);
      if (sortNumDir === "1-9") {
        setSortNumDir("9-1");
        const sortedDesc = [...nonBlank].sort((a, b) => {
          if (a.fileIndex !== b.fileIndex) return b.fileIndex - a.fileIndex;
          return b.pageIndex - a.pageIndex;
        });
        return reinsertBlanksAtRelativePositions(prev, sortedDesc);
      } else {
        setSortNumDir("1-9");
        const sortedAsc = [...nonBlank].sort((a, b) => {
          if (a.fileIndex !== b.fileIndex) return a.fileIndex - b.fileIndex;
          return a.pageIndex - b.pageIndex;
        });
        return reinsertBlanksAtRelativePositions(prev, sortedAsc);
      }
    });
  }

  // 3. Interleave pages: Round-robin across files
  function handleInterleave() {
    if (files.length <= 1) return;
    setPages((prev) => {
      const byFile: PageItem[][] = files.map((_, fi) =>
        prev.filter((p) => p.fileIndex === fi && !p.isBlank)
      );
      const maxPages = Math.max(...byFile.map((arr) => arr.length));
      const interleaved: PageItem[] = [];

      for (let step = 0; step < maxPages; step++) {
        for (let fi = 0; fi < files.length; fi++) {
          if (byFile[fi][step]) {
            interleaved.push(byFile[fi][step]);
          }
        }
      }
      return reinsertBlanksAtRelativePositions(prev, interleaved);
    });
  }

  /* ── Sidebar Actions ────────────────────────────────────── */
  function handleRemoveFile(fileIdxToRemove: number) {
    const fileToRemove = files[fileIdxToRemove];
    if (!fileToRemove) return;

    if (files.length <= 1) {
      reset();
      return;
    }

    // Remove this file and re-map file indices
    const updatedFiles = files.filter((_, idx) => idx !== fileIdxToRemove);
    // Remove all pages belonging to this file, and update fileIndex of remaining pages
    const remainingPages = pages.filter((p) => p.fileId !== fileToRemove.id);

    const { reLetteredFiles, updatedPages } = resequencePagesForFiles(updatedFiles, remainingPages);

    if (!updatedPages.some((p) => !p.isBlank)) {
      setError("At least one real page is required.");
    } else {
      setError("");
    }

    setFiles(reLetteredFiles);
    setPages(updatedPages);
  }

  /* ── Move/Reorder Files Up/Down ─────────────────────────── */
  function handleMoveFile(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= files.length || fromIndex === toIndex) return;

    const updatedFiles = [...files];
    const [movedFile] = updatedFiles.splice(fromIndex, 1);
    updatedFiles.splice(toIndex, 0, movedFile);

    const { reLetteredFiles, updatedPages } = resequencePagesForFiles(updatedFiles, pages);

    setFiles(reLetteredFiles);
    setPages(updatedPages);
  }

  /* ── Sidebar File Chip Drag Handlers ────────────────────── */
  function handleFileChipDragStart(e: React.DragEvent, idx: number) {
    setDraggedFileIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `file-chip-${idx}`);
  }

  function handleFileChipDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverFileIdx !== idx) {
      setDragOverFileIdx(idx);
    }
  }

  function handleFileChipDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    e.stopPropagation();
    if (draggedFileIdx !== null && draggedFileIdx !== targetIdx) {
      handleMoveFile(draggedFileIdx, targetIdx);
    }
    setDraggedFileIdx(null);
    setDragOverFileIdx(null);
  }

  function handleFileChipDragEnd() {
    setDraggedFileIdx(null);
    setDragOverFileIdx(null);
  }

  function reset() {
    cancelRef.current?.();
    loadIdRef.current++;
    runIdRef.current++;
    setFiles([]);
    setPages([]);
    setResults([]);
    setError("");
    setProgress(null);
    setStatusMsg("");
    setCancel(null);
    setSortAlphaDir("A-Z");
    setSortNumDir("1-9");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (appendFileInputRef.current) appendFileInputRef.current.value = "";
  }

  /* ── Run Organize ───────────────────────────────────────── */
  async function run() {
    if (files.length === 0 || pages.length === 0 || !hasRealPages) {
      if (!hasRealPages && pages.length > 0) {
        setError("At least one real page is required.");
      }
      return;
    }
    const runId = ++runIdRef.current;
    setError("");
    setResults([]);
    setProgress(0.05);
    setStatusMsg("Preparing pages…");

    try {
      // 1. Prepare raw input files
      const inputFiles = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setStatusMsg(`Preparing file ${i + 1} of ${files.length}…`);
        inputFiles.push({
          name: f.file.name,
          data: new Uint8Array(await f.file.arrayBuffer()),
        });
        if (runId !== runIdRef.current) return;
      }

      // 2. Prepare pages spec
      const pagesSpec = pages.map((p) => ({
        fileIndex: p.fileIndex,
        pageIndex: p.pageIndex,
        rotation: p.rotation,
        isBlank: p.isBlank,
        width: p.width,
        height: p.height,
      }));

      const firstBase = files[0].file.name.replace(/\.pdf$/i, "");
      const outputName = `${firstBase}_organized.pdf`;

      const job = runTool(
        "organize",
        inputFiles,
        { pages: pagesSpec, outputName },
        (p) => {
          if (runId === runIdRef.current) {
            setProgress((prev) => (prev === null ? Math.max(0.1, p) : Math.max(prev, p)));
            setStatusMsg(`Organizing PDF (${Math.round(p * 100)}%)…`);
          }
        }
      );

      setCancel(() => job.cancel);
      const outputs: OutputFile[] = await job.promise;
      if (runId !== runIdRef.current || files.length === 0) return;

      const mapped = outputs.map((o) => ({
        name: o.name,
        url: URL.createObjectURL(uint8ArrayToBlob(o.data, o.mime)),
        size: o.data.byteLength,
      }));

      setResults(mapped);
    } catch (err: any) {
      if (runId === runIdRef.current && !isCancelledError(err)) {
        setError(err?.message ?? "An error occurred while organizing the PDF.");
      }
    } finally {
      if (runId === runIdRef.current) {
        setProgress(null);
        setStatusMsg("");
        setCancel(null);
      }
    }
  }

  /* ── Hidden file inputs ─────────────────────────────────── */
  const renderHiddenInputs = () => (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="application/pdf"
        hidden
        onChange={(e) => {
          if (e.target.files) loadFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={appendFileInputRef}
        type="file"
        multiple
        accept="application/pdf"
        hidden
        onChange={(e) => {
          if (e.target.files) {
            loadFiles(e.target.files, insertIndexRef.current ?? undefined);
            insertIndexRef.current = null;
          }
          e.target.value = "";
        }}
      />
    </>
  );

  /* ── 1. Render Initial Dropzone (Empty State) ────────────── */
  if (files.length === 0) {
    return (
      <div className="tool-runner-panel">
        <div className="dropzone-container">
          {renderHiddenInputs()}
          <button
            type="button"
            className={`dropzone ${isDraggingFile ? "active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingFile(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingFile(false);
            }}
            onDrop={handleInitialDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{ width: "100%", fontFamily: "inherit", cursor: "pointer" }}
          >
            <svg
              aria-hidden="true"
              className="dropzone-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>

            <p className="dropzone-text-primary">
              Choose PDF files, or drag and drop here
            </p>
            <span className="dropzone-badge">
              Multiple files (.pdf)
            </span>
          </button>

          {error && (
            <div className="alert-error" style={{ marginTop: "1rem" }}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── 2. Render Results Screen ────────────────────────────── */
  if (results.length > 0 && files.length > 0) {
    return (
      <div className="split-tool-wrap">
        <div
          style={{
            background: "#f0fdf4",
            border: "1.5px solid #a7f3d0",
            borderRadius: "var(--radius-lg)",
            padding: "1.25rem 1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <strong style={{ color: "#065f46" }}>
            Organize complete — 1 file ready
          </strong>
        </div>

        {memoryWarning && (
          <output
            className="alert-warning"
            style={{ marginBottom: "1rem" }}
          >
            {memoryWarning}
          </output>
        )}

        {error && (
          <div
            role="alert"
            className="alert-error"
            style={{ marginBottom: "1rem" }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>{error}</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {results.map((r) => (
            <div
              key={r.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.875rem 1.125rem",
                border: "1.5px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                background: "#fff",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {formatBytes(r.size)}
                  </div>
                </div>
              </div>
              <a
                href={r.url}
                download={r.name}
                className="btn-primary"
                style={{ whiteSpace: "nowrap", padding: "0.5rem 1.1rem", fontSize: "0.85rem", textDecoration: "none" }}
              >
                Download
              </a>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button onClick={reset} className="btn-secondary" style={{ flex: 1 }}>
            Organize another PDF
          </button>
        </div>
      </div>
    );
  }

  let sortAlphaTitle = "Add multiple files to sort alphabetically";
  if (files.length > 1) {
    sortAlphaTitle = sortAlphaDir === "A-Z"
      ? "Sort files A to Z (Alphabetical)"
      : "Sort files Z to A (Reverse Alphabetical)";
  }

  /* ── 3. Render Main Workspace (Grid + Sidebar) ───────────── */
  return (
    <div className="split-tool-wrap">
      {renderHiddenInputs()}

      {/* Lightbox Zoom Modal */}
      {zoomPageInfo && (
        <PdfZoomModal
          file={zoomPageInfo.file}
          pageNum={zoomPageInfo.pageNum}
          rotation={zoomPageInfo.rotation}
          onClose={() => setZoomPageInfo(null)}
        />
      )}

      <div className="split-layout">
        {/* LEFT: Main Page Cards Grid Panel */}
        <div className="organize-main-panel">
          <div className="organize-grid-relative">
            {/* Pages Grid */}
            <div className="organize-pages-grid">
              {pages.map((item, idx) => {
                const fileEntry =
                  files.find((f) => f.id === item.fileId) ||
                  files[item.fileIndex] ||
                  files[0];
                return (
                  <OrganizePageCard
                    key={item.id}
                    item={item}
                    seqNumber={idx + 1}
                    theme={fileEntry?.theme}
                    file={fileEntry?.file}
                    isDragging={draggedPageIndex === idx}
                    isDropTarget={dragOverPageIndex === idx && draggedPageIndex !== idx}
                    canMoveLeft={idx > 0}
                    canMoveRight={idx < pages.length - 1}
                    onMoveLeft={() => handleMovePage(idx, idx - 1)}
                    onMoveRight={() => handleMovePage(idx, idx + 1)}
                    onRotate={() => handleRotatePage(idx)}
                    onDelete={() => handleDeletePage(idx)}
                    onZoom={() => {
                      if (fileEntry?.file) {
                        setZoomPageInfo({
                          file: fileEntry.file,
                          pageNum: item.pageIndex + 1,
                          rotation: item.rotation || 0,
                        });
                      }
                    }}
                    onDragStart={(e) => handleCardDragStart(e, idx)}
                    onDragOver={(e) => handleCardDragOver(e, idx)}
                    onDragEnter={(e) => handleCardDragEnter(e, idx)}
                    onDragLeave={handleCardDragLeave}
                    onDrop={(e) => handleCardDrop(e, idx)}
                    onDragEnd={handleCardDragEnd}
                    onInsertBlank={() => handleInsertBlank(idx)}
                    onInsertPdfClick={() => handleInsertPdfPrompt(idx)}
                  />
                );
              })}
            </div>

            {/* Floating Quick Action Toolbar (Right side of grid) */}
            <aside className="organize-floating-toolbar" aria-label="Organize toolbar">
              {/* Add more files button with file count badge */}
              <button
                type="button"
                className="organize-tool-btn add"
                title="Add more files"
                onClick={() => {
                  insertIndexRef.current = null;
                  appendFileInputRef.current?.click();
                }}
              >
                <span className="organize-tool-badge">{files.length}</span>
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              <div className="organize-tool-divider" />

              {/* Sort A-Z / Z-A */}
              <button
                type="button"
                className="organize-tool-btn"
                title={sortAlphaTitle}
                disabled={files.length <= 1}
                onClick={handleSortAlphabetical}
              >
                {sortAlphaDir === "A-Z" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 800 }}>A</span>
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="7 10 12 15 17 10" />
                    </svg>
                    <span style={{ fontSize: "0.72rem", fontWeight: 800 }}>Z</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 800 }}>Z</span>
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="7 10 12 15 17 10" />
                    </svg>
                    <span style={{ fontSize: "0.72rem", fontWeight: 800 }}>A</span>
                  </div>
                )}
              </button>

              {/* Sort 1-9 / 9-1 */}
              <button
                type="button"
                className="organize-tool-btn"
                title={
                  sortNumDir === "1-9"
                    ? "Sort 9 to 1 (Reverse page order)"
                    : "Sort 1 to 9 (Ascending page order)"
                }
                onClick={handleNumericSort}
              >
                {sortNumDir === "1-9" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 800 }}>1</span>
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <polyline points="19 12 12 19 5 12" />
                    </svg>
                    <span style={{ fontSize: "0.75rem", fontWeight: 800 }}>9</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 800 }}>9</span>
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <polyline points="19 12 12 19 5 12" />
                    </svg>
                    <span style={{ fontSize: "0.75rem", fontWeight: 800 }}>1</span>
                  </div>
                )}
              </button>

              {/* Sort 1-1 2-2 (Interleave) */}
              {files.length > 1 && (
                <button
                  type="button"
                  className="organize-tool-btn"
                  title="Interleave pages across files (1-1, 2-2)"
                  onClick={handleInterleave}
                >
                  <div style={{ fontSize: "0.62rem", fontWeight: 800, lineHeight: 1.1, textAlign: "center" }}>
                    1-1<br />2-2
                  </div>
                </button>
              )}
            </aside>
          </div>
        </div>

        {/* RIGHT: Config Panel (Matching iLovePDF Sidebar) */}
        <div className="split-config-panel">
          <h2 style={{ fontSize: "1.375rem", fontWeight: 800, margin: "0 0 1rem", textAlign: "center" }}>
            Organize pdf
          </h2>

          {/* Files List Section */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-main)" }}>
                Files:
              </span>
              <button
                type="button"
                onClick={reset}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--primary, #7c3aed)",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                Reset all
              </button>
            </div>

            {/* List of File Chips */}
            <div className="organize-files-list">
              {files.map((entry, idx) => (
                <div
                  key={entry.id}
                  className={`organize-file-chip ${draggedFileIdx === idx ? "dragging" : ""} ${dragOverFileIdx === idx && draggedFileIdx !== idx ? "drop-target" : ""}`}
                  draggable
                  onDragStart={(e) => handleFileChipDragStart(e, idx)}
                  onDragOver={(e) => handleFileChipDragOver(e, idx)}
                  onDrop={(e) => handleFileChipDrop(e, idx)}
                  onDragEnd={handleFileChipDragEnd}
                  style={{
                    backgroundColor: entry.theme.bg,
                    borderColor: entry.theme.border,
                    color: entry.theme.text,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
                    <div
                      className="organize-chip-handle"
                      title="Drag to reorder"
                    >
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="7 15 12 20 17 15" />
                        <polyline points="7 9 12 4 17 9" />
                      </svg>
                    </div>
                    <span style={{ fontWeight: 800, flexShrink: 0 }}>
                      {entry.letter}:
                    </span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                      }}
                      title={entry.file.name}
                    >
                      {entry.file.name}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="organize-chip-del-btn"
                    title={`Remove ${entry.file.name}`}
                    onClick={() => handleRemoveFile(idx)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Document Summary Info */}
          <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "0.5rem", borderTop: "1px solid var(--border-light)", paddingTop: "0.75rem" }}>
            <div>Total files: <strong style={{ color: "var(--text-main)" }}>{files.length}</strong></div>
            <div>Total pages in sequence: <strong style={{ color: "var(--text-main)" }}>{pages.length}</strong></div>
          </div>

          {/* Errors */}
          {error && (
            <div className="alert-error">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {/* Progress */}
          {isRunning && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ height: 6, background: "#e9e5ff", borderRadius: 99, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg, var(--primary), #a855f7)",
                    borderRadius: 99,
                    width: `${Math.round((progress ?? 0) * 100)}%`,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>{statusMsg}</p>
            </div>
          )}

          {/* Main Action Button */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginTop: "auto", paddingTop: "1rem" }}>
            {isRunning ? (
              <button
                type="button"
                className="btn-danger-outline"
                onClick={() => {
                  cancel?.();
                }}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="split-run-btn"
                onClick={run}
                disabled={files.length === 0 || pages.length === 0 || !hasRealPages}
                title={!hasRealPages && pages.length > 0 ? "At least one real page is required." : undefined}
              >
                Organize
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 8 16 12 12 16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </button>
            )}

            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                insertIndexRef.current = null;
                appendFileInputRef.current?.click();
              }}
            >
              + Add more files
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
