/** The contract every tool module implements. Modules depend ONLY on this package. */
export type Category = "organize" | "edit" | "convert" | "security" | "ocr";

export type FieldDef =
  | { key: string; label: string; type: "text"; default?: string; help?: string; placeholder?: string }
  | { key: string; label: string; type: "number"; default?: number; min?: number; max?: number; help?: string }
  | { key: string; label: string; type: "checkbox"; default?: boolean; help?: string }
  | { key: string; label: string; type: "select"; default?: string; options: { value: string; label: string }[]; help?: string };

/** Lightweight, import-safe metadata. Must NOT import heavy libraries. */
export interface ToolManifest {
  id: string;
  title: string;
  description: string;
  category: Category;
  backend: "client" | "server" | "hybrid";
  accepts: string[];     // MIME types
  multiple: boolean;     // accepts several input files
  fields: FieldDef[];
}

export interface OutputFile { name: string; mime: string; data: Uint8Array }

export interface RunContext {
  onProgress(fraction: number): void;
  signal: AbortSignal;
}

export interface ToolModule<O = Record<string, any>> {
  manifest: ToolManifest;
  run(inputs: { name: string; data: Uint8Array }[], opts: O, ctx: RunContext): Promise<OutputFile[]>;
}

export class ToolError extends Error {}

/** "1-3,5,8-" -> zero-based page indexes (deduped, in order). */
export function parsePageSpec(spec: string | undefined | null, total: number): number[] {
  if (total <= 0) return [];
  const out: number[] = [];
  const s = (spec ?? "").trim();
  if (!s) return Array.from({ length: total }, (_, i) => i);
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\d+)?(?:-(\d+)?)?$/);
    if (!m || (!m[1] && !m[2])) throw new ToolError(`Invalid page range: "${part}"`);
    const a = m[1] ? +m[1] : 1;
    const b = part.includes("-") ? (m[2] ? +m[2] : total) : a;
    if (a < 1 || b > total || a > b) throw new ToolError(`Range "${part}" is outside 1-${total}`);
    for (let i = a; i <= b; i++) if (!out.includes(i - 1)) out.push(i - 1);
  }
  return out;
}

export function checkAborted(signal: AbortSignal) {
  if (signal.aborted) throw new ToolError("Cancelled");
}
