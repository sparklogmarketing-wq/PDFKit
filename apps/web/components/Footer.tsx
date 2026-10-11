import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <span>PDFKit</span>
        </div>

        <div className="footer-links">
          <Link href="/">Home</Link>
          <Link href="/tools/merge">Merge</Link>
          <Link href="/tools/split">Split</Link>
          <Link href="/tools/rotate">Rotate</Link>
        </div>
      </div>
    </footer>
  );
}
