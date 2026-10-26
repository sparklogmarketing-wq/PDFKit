import { formatPageIndices, formatPageRanges } from "./pageRanges.ts";
export { formatBytes } from "./formatBytes.ts";
export { uint8ArrayToBlob } from "./blob.ts";
export { generateUUID } from "./uuid.ts";

export function formatPageCount(count: number | null | undefined): string {
  if (count === null || count === undefined || !Number.isFinite(count) || count < 0) {
    return "Unknown pages";
  }
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

export function clampMonotonicProgress(prev: number | null | undefined, next: number): number {
  if (prev === null || prev === undefined || !Number.isFinite(prev)) {
    return next;
  }
  return Math.max(prev, next);
}

export function calculateTotalPages(files: readonly File[], pagesMap: Record<string, number>): number {
  return files.reduce((sum, file) => sum + (pagesMap[file.name] || 0), 0);
}

export function filterPdfFiles(files: FileList | File[] | null): File[] {
  if (!files || files.length === 0) return [];
  return Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
}

export function isSameFile(
  a: { readonly name: string; readonly size?: number; readonly lastModified?: number },
  b: { readonly name: string; readonly size?: number; readonly lastModified?: number }
): boolean {
  if (a === b) return true;
  if (a.name !== b.name) return false;
  if (typeof a.size === "number" && typeof b.size === "number" && a.size !== b.size) {
    return false;
  }
  if (
    typeof a.lastModified === "number" &&
    typeof b.lastModified === "number" &&
    a.lastModified !== b.lastModified
  ) {
    return false;
  }
  return true;
}

function generateDistinctName(baseName: string, usedNames: ReadonlySet<string>): string {
  if (!usedNames.has(baseName)) return baseName;
  const dotIndex = baseName.lastIndexOf(".");
  const stem = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
  const ext = dotIndex > 0 ? baseName.slice(dotIndex) : "";

  let counter = 1;
  while (usedNames.has(`${stem} (${counter})${ext}`)) {
    counter++;
  }
  return `${stem} (${counter})${ext}`;
}

function makeDistinctFile(file: File, uniqueName: string): File {
  if (file.name === uniqueName) return file;
  if (typeof file.slice === "function" && typeof File === "function") {
    try {
      return new File([file], uniqueName, {
        type: file.type,
        lastModified: file.lastModified,
      });
    } catch {
      // Fall through to cloned object
    }
  }
  return Object.assign(Object.create(Object.getPrototypeOf(file)), file, { name: uniqueName });
}

export function appendUniqueFiles(existing: readonly File[], incoming: readonly File[]): File[] {
  const result: File[] = [...existing];
  const usedNames = new Set(existing.map((f) => f.name));

  for (const file of incoming) {
    if (result.some((ef) => isSameFile(ef, file))) {
      continue;
    }
    const distinctName = generateDistinctName(file.name, usedNames);
    usedNames.add(distinctName);
    result.push(makeDistinctFile(file, distinctName));
  }

  return result;
}

export function formatPagesToRangeString(pageIndices: readonly number[]): string {
  return formatPageIndices(pageIndices);
}
