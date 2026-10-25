import { useState, useCallback } from "react";

export interface DownloadFileItem {
  readonly name: string;
  readonly url: string;
}

/**
 * Downloads multiple files bundled into a single ZIP archive.
 * Validates fetch responses (checks res.ok) and safely revokes object URLs.
 */
export async function downloadFilesAsZip(
  files: readonly DownloadFileItem[],
  zipFilename: string
): Promise<void> {
  if (!files || files.length === 0) {
    throw new Error("No files provided to generate ZIP archive.");
  }

  const JSZipModule = await import("jszip");
  const JSZip = JSZipModule.default ?? JSZipModule;
  const zip = new JSZip();

  // Fetch each file blob and add to ZIP with response status validation
  await Promise.all(
    files.map(async (file) => {
      const res = await fetch(file.url);
      if (!res.ok) {
        throw new Error(
          `Failed to fetch file "${file.name}": ${res.status} ${res.statusText || "Fetch failed"}`
        );
      }
      const blob = await res.blob();
      zip.file(file.name, blob);
    })
  );

  const zipBlob = await zip.generateAsync({ type: "blob" });

  if (typeof document !== "undefined" && typeof URL?.createObjectURL === "function") {
    let downloadUrl: string | null = null;
    try {
      downloadUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = zipFilename.endsWith(".zip") ? zipFilename : `${zipFilename}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      const urlToRevoke = downloadUrl;
      if (urlToRevoke) {
        setTimeout(() => {
          URL.revokeObjectURL(urlToRevoke);
        }, 15000);
      }
    }
  }
}

/**
 * Shared hook to manage ZIP download state and surface failures consistently.
 */
export function useZipDownload() {
  const [isZipping, setIsZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  const downloadZip = useCallback(
    async (files: readonly DownloadFileItem[], zipFilename: string): Promise<boolean> => {
      if (!files || files.length === 0 || isZipping) return false;
      setIsZipping(true);
      setZipError(null);
      try {
        await downloadFilesAsZip(files, zipFilename);
        return true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to create ZIP archive.";
        setZipError(message);
        return false;
      } finally {
        setIsZipping(false);
      }
    },
    [isZipping]
  );

  const clearZipError = useCallback(() => {
    setZipError(null);
  }, []);

  return { isZipping, zipError, downloadZip, clearZipError };
}
