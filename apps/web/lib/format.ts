import { formatPageRanges } from "./pageRanges";

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatPageCount(count: number | null): string {
  if (count === null) return "1 page";
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

export function calculateTotalPages(files: readonly File[], pagesMap: Record<string, number>): number {
  return files.reduce((sum, file) => sum + (pagesMap[file.name] || 0), 0);
}

export function filterPdfFiles(files: FileList | File[] | null): File[] {
  if (!files || files.length === 0) return [];
  return Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
}

export function appendUniqueFiles(existing: readonly File[], incoming: readonly File[]): File[] {
  const existingNames = new Set(existing.map((f) => f.name));
  return [...existing, ...incoming.filter((f) => !existingNames.has(f.name))];
}

export function formatPagesToRangeString(pageIndices: readonly number[]): string {
  return formatPageRanges(pageIndices.map((i) => i + 1));
}
