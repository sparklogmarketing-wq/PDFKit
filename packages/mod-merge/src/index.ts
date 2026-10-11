import { PDFDocument } from "@cantoo/pdf-lib";
import { checkAborted, ToolError, type ToolModule } from "@pdfkit/core";
import { manifest } from "./manifest.ts";

const mod: ToolModule = {
  manifest,
  async run(inputs, _opts, ctx) {
    if (inputs.length < 2) throw new ToolError("Add at least two PDFs to merge.");
    const out = await PDFDocument.create();
    for (let i = 0; i < inputs.length; i++) {
      checkAborted(ctx.signal);
      const src = await PDFDocument.load(inputs[i].data);
      (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
      ctx.onProgress((i + 1) / inputs.length);
    }
    return [{ name: "merged.pdf", mime: "application/pdf", data: await out.save() }];
  },
};
export default mod;
