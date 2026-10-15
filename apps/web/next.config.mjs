/** Static export: zero server load. Heavy server tools live behind optional providers. */
export default {
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@pdfkit/core", "@pdfkit/mod-merge", "@pdfkit/mod-split", "@pdfkit/mod-rotate", "@pdfkit/mod-organize"],
};
