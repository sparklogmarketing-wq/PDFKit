"use client";

import { useState, useCallback, type ReactNode, type RefObject } from "react";
import PdfDropzone from "./PdfDropzone";

export interface ToolWorkspaceShellProps {
  readonly filesCount: number;
  readonly totalPages: number;
  readonly error?: string;
  readonly warning?: string;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly onFilesSelected: (files: FileList | null, append: boolean) => void;
  readonly allowMultiple?: boolean;
  readonly accept?: string;
  readonly emptyDropzoneText?: string;
  readonly emptyDropzoneBadge?: string;
  readonly compactDropzoneBadge?: string;
  readonly children?: ReactNode;
}

export default function ToolWorkspaceShell({
  filesCount,
  totalPages,
  error,
  warning,
  fileInputRef,
  onFilesSelected,
  allowMultiple = true,
  accept = "application/pdf",
  emptyDropzoneText,
  emptyDropzoneBadge,
  compactDropzoneBadge,
  children,
}: ToolWorkspaceShellProps) {
  const [isDragging, setIsDragging] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFilesSelected(e.dataTransfer.files, allowMultiple ? filesCount > 0 : false);
      }
    },
    [allowMultiple, filesCount, onFilesSelected]
  );

  if (filesCount === 0) {
    const defaultText = allowMultiple
      ? "Choose PDF files, or drag and drop here"
      : "Choose a PDF file, or drag and drop here";
    const defaultBadge = allowMultiple ? "Multiple files (.pdf)" : "Single PDF file (.pdf)";

    return (
      <div className="tool-runner-panel workspace-empty-panel">
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple={allowMultiple}
          accept={accept}
          onChange={(e) => {
            onFilesSelected(e.target.files, false);
            e.target.value = "";
          }}
        />

        <PdfDropzone
          isDragging={isDragging}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          primaryText={emptyDropzoneText ?? defaultText}
          badgeText={emptyDropzoneBadge ?? defaultBadge}
        />

        {warning && !error && (
          <output className="alert-warning workspace-alert">
            {warning}
          </output>
        )}

        {error && (
          <div className="alert-error workspace-alert" role="alert">
            {error}
          </div>
        )}
      </div>
    );
  }

  const defaultCompactBadge = `${filesCount} ${filesCount === 1 ? "PDF" : "PDFs"} selected (${totalPages} pages total)`;

  return (
    <div className="workspace-root">
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple={allowMultiple}
        accept={accept}
        onChange={(e) => {
          onFilesSelected(e.target.files, allowMultiple);
          e.target.value = "";
        }}
      />

      {allowMultiple && (
        <PdfDropzone
          isCompact
          isDragging={isDragging}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          badgeText={compactDropzoneBadge ?? defaultCompactBadge}
        />
      )}

      {warning && (
        <output className="alert-warning workspace-alert-spaced">
          {warning}
        </output>
      )}

      {error && (
        <div className="alert-error workspace-alert-spaced" role="alert">
          {error}
        </div>
      )}

      {children}
    </div>
  );
}
