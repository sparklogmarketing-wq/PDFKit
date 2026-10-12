import "./globals.css";
import Navbar from "../components/Navbar";

export const metadata = {
  title: "PDFKit",
  description: "Merge, split, and rotate PDFs in your browser.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="site-wrapper">
          <Navbar />
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
