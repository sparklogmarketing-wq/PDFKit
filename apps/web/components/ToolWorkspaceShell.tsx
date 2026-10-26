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
    return (
      <div className="tool-runner-panel workspace-empty-panel">
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple={allowMultiple}
          accept="application/pdf"
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
          primaryText={allowMultiple ? "Choose PDF files, or drag and drop here" : "Choose a PDF file, or drag and drop here"}
          badgeText={allowMultiple ? "Multiple files (.pdf)" : "Single PDF file (.pdf)"}
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

  return (
    <div className="workspace-root">
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple={allowMultiple}
        accept="application/pdf"
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
          badgeText={`${filesCount} ${filesCount === 1 ? "PDF" : "PDFs"} selected (${totalPages} pages total)`}
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
