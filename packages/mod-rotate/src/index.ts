import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { checkAborted, parsePageSpec, type ToolModule } from "@pdfkit/core";
import { manifest } from "./manifest.ts";

const mod: ToolModule<{ degrees: string; pages?: string }> = {
  manifest,
  async run([file], opts, ctx) {
    checkAborted(ctx.signal);
    const doc = await PDFDocument.load(file.data);
    const pages = doc.getPages();
    const targetPages = parsePageSpec(opts.pages, pages.length);
    for (let idx = 0; idx < targetPages.length; idx++) {
      checkAborted(ctx.signal);
      const i = targetPages[idx];
      const cur = pages[i].getRotation().angle;
      pages[i].setRotation(degrees((cur + Number(opts.degrees)) % 360));
      ctx.onProgress((idx + 1) / Math.max(1, targetPages.length));
    }
    checkAborted(ctx.signal);
    return [{ name: file.name.replace(/\.pdf$/i, "") + "-rotated.pdf", mime: "application/pdf", data: await doc.save() }];
  },
};
export default mod;
