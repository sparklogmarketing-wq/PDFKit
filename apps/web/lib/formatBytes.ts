/**
 * Formats a byte size into a human-readable string (e.g., "0 B", "1.5 KB", "10 MB").
 * Single canonical implementation used across all PDFKit tools.
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const unitIndex = Math.min(Math.max(0, i), sizes.length - 1);
  return `${Number.parseFloat((bytes / Math.pow(k, unitIndex)).toFixed(1))} ${sizes[unitIndex]}`;
}
