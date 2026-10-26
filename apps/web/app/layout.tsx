import type { Metadata } from "next";
import "./globals.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export const metadata: Metadata = {
  title: {
    default: "PDFKit — Free Online PDF Tools",
    template: "%s | PDFKit",
  },
  description: "Merge, split, and rotate PDFs in your browser. Fast, free, and private.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://pdfkit.org"),
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

const isDev = process.env.NODE_ENV === "development";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {!isDev && (
          <meta
            httpEquiv="Content-Security-Policy"
            content="default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'self';"
          />
        )}
      </head>
      <body>
        <div className="site-wrapper">
          <Navbar />
          <main className="main-content">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
