"use client";

import { useState, useCallback, type ReactNode, type RefObject } from "react";
import PdfDropzone from "./PdfDropzone";

export interface ToolWorkspaceShellProps {
  readonly filesCount: number;
  readonly totalPages: number;
  readonly error?: string;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly onFilesSelected: (files: FileList | null, append: boolean) => void;
  readonly children?: ReactNode;
}

export default function ToolWorkspaceShell({
  filesCount,
  totalPages,
  error,
  fileInputRef,
  onFilesSelected,
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
        onFilesSelected(e.dataTransfer.files, filesCount > 0);
      }
    },
    [filesCount, onFilesSelected]
  );

  if (filesCount === 0) {
    return (
      <div className="tool-runner-panel" style={{ maxWidth: 860, margin: "0 auto" }}>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
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
        />

        {error && (
          <div className="alert-error" style={{ marginTop: "1rem" }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        margin: "0 auto",
        paddingBottom: "3rem",
        overflowX: "clip",
        boxSizing: "border-box",
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept="application/pdf"
        onChange={(e) => {
          onFilesSelected(e.target.files, true);
          e.target.value = "";
        }}
      />

      <PdfDropzone
        isCompact
        isDragging={isDragging}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        badgeText={`${filesCount} ${filesCount === 1 ? "PDF" : "PDFs"} selected (${totalPages} pages total)`}
      />

      {children}
    </div>
  );
}
