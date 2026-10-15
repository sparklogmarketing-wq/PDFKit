"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ToolManifest } from "@pdfkit/core";
import { ToolIcon } from "./ToolIcon";

export default function HomeTools({ manifests }: { readonly manifests: ToolManifest[] }) {
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
                    <div className="tool-icon-box">
                      <ToolIcon id={m.id} size={24} />
                    </div>
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
