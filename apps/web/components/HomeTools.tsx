"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ToolManifest } from "@pdfkit/core";

function getToolIcon(id: string) {
  switch (id) {
    case "merge":
      return (
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="2" width="13" height="15" rx="2" />
          <path d="M4 8v12a2 2 0 0 0 2 2h12" />
        </svg>
      );
    case "split":
      return (
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="2" y1="13" x2="22" y2="13" strokeDasharray="2 2" />
        </svg>
      );
    case "rotate":
      return (
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.5 2v6h-6" />
          <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
      );
    default:
      return (
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

export default function HomeTools({ manifests }: { manifests: ToolManifest[] }) {
  const searchParams = useSearchParams();
  const search = searchParams.get("q") ?? "";

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return manifests;
    return manifests.filter(
      (m) =>
        m.title.toLowerCase().includes(term) ||
        m.description.toLowerCase().includes(term) ||
        m.id.toLowerCase().includes(term)
    );
  }, [manifests, search]);

  return (
    <>
      <section className="hero-section">
        <h1 className="hero-title">
          Every PDF Tool You Need,{" "}
          <span style={{ color: "var(--primary)" }}>Free &amp; Online</span>
        </h1>
        <p className="hero-desc">
          Merge, split, rotate and transform your PDF files — fast, private, and all in your browser.
        </p>
      </section>

      <section className="tools-section">
        <div className="section-heading">
          <h2 className="section-title">All Tools</h2>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted)" }}>
            <p>No tools found matching &quot;{search}&quot;.</p>
          </div>
        ) : (
          <ul className="tools-grid">
            {filtered.map((m) => (
              <li key={m.id}>
                <Link href={`/tools/${m.id}`} className="tool-card">
                  <div className="tool-card-header">
                    <div className="tool-icon-box">{getToolIcon(m.id)}</div>
                  </div>
                  <h3 className="tool-card-title">{m.title}</h3>
                  <p className="tool-card-desc">{m.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
