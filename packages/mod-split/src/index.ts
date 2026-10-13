import { PDFDocument } from "@cantoo/pdf-lib";
import { checkAborted, parsePageSpec, ToolError, type ToolModule } from "@pdfkit/core";
import { manifest } from "./manifest.ts";

const mod: ToolModule<{ mode: string; ranges: string; n: number; mergeAll?: boolean }> = {
  manifest,
  async run([file], opts, ctx) {
    checkAborted(ctx.signal);
    const src = await PDFDocument.load(file.data);
    const total = src.getPageCount();
    let groups: number[][];
    if (opts.mode === "every") {
      const n = Math.max(1, Math.floor(Number(opts.n) || 1));
      groups = [];
      for (let i = 0; i < total; i += n) groups.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k));
    } else {
      const r = (opts.ranges ?? "").trim();
      if (!r) throw new ToolError("No page ranges given.");
      groups = r.split(",").filter((g) => g.trim()).map((g) => parsePageSpec(g, total));
    }
    if (!groups.length) throw new ToolError("No page ranges given.");
    const base = file.name.replace(/\.pdf$/i, "");

    if (opts.mergeAll) {
      checkAborted(ctx.signal);
      const doc = await PDFDocument.create();
      const allPages = groups.flat();
      const copied = await doc.copyPages(src, allPages);
      copied.forEach((p) => doc.addPage(p));
      ctx.onProgress(1);
      return [{
        name: `${base}-merged.pdf`,
        mime: "application/pdf",
        data: await doc.save(),
      }];
    }

    const outputs = [];
    for (let i = 0; i < groups.length; i++) {
      checkAborted(ctx.signal);
      const doc = await PDFDocument.create();
      (await doc.copyPages(src, groups[i])).forEach((p) => doc.addPage(p));
      outputs.push({ name: `${base}-part${i + 1}.pdf`, mime: "application/pdf", data: await doc.save() });
      ctx.onProgress((i + 1) / groups.length);
    }
    return outputs;
  },
};
export default mod;
