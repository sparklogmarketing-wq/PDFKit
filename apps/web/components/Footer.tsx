import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-privacy-note">
          <span>PDFKit — Fast, private PDF tools in your browser.</span>
        </div>

        <nav className="footer-links" aria-label="Footer navigation">
          <Link href="/">Home</Link>
          <Link href="/tools/merge">Merge</Link>
          <Link href="/tools/split">Split</Link>
          <Link href="/tools/rotate">Rotate</Link>
          <Link href="/tools/remove">Remove</Link>
          <Link href="/tools/organize">Organize</Link>
          <Link href="/tools/extract">Extract</Link>
        </nav>
      </div>
    </footer>
  );
}
