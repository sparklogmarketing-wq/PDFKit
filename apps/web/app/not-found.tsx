import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
      <h1 style={{ fontSize: "2.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>404</h1>
      <h2 style={{ fontSize: "1.25rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Page Not Found
      </h2>
      <p style={{ maxWidth: "24rem", margin: "0 auto 2rem", color: "var(--text-muted)" }}>
        The tool or page you requested doesn&apos;t exist or may have been moved.
      </p>
      <Link href="/" className="btn-primary">
        Back to All Tools
      </Link>
    </div>
  );
}
