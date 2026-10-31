const basePath = process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || "";

/** Static export: zero server load. Heavy server tools live behind optional providers. */
export default {
  output: "export",
  ...(basePath ? { basePath } : {}),
  images: { unoptimized: true },
  transpilePackages: [
    "@pdfkit/core",
    "@pdfkit/mod-merge",
    "@pdfkit/mod-remove",
    "@pdfkit/mod-split",
    "@pdfkit/mod-rotate",
    "@pdfkit/mod-organize",
    "@pdfkit/mod-extract",
    "@pdfkit/mod-jpg-to-pdf",
    "@pdfkit/mod-word-to-pdf",
  ],
};
