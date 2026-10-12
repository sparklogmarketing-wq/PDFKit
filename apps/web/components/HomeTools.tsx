"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ToolManifest } from "@pdfkit/core";

function getToolIcon(id: string) {
  switch (id) {
    case "merge":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7V4h16v3"></path>
          <path d="M9 20h6"></path>
          <path d="M12 4v16"></path>
          <rect x="3" y="10" width="7" height="7" rx="1.5"></rect>
          <rect x="14" y="10" width="7" height="7" rx="1.5"></rect>
        </svg>
      );
    case "split":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="2" y1="13" x2="22" y2="13" strokeDasharray="2 2"></line>
        </svg>
      );
    case "rotate":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.5 2v6h-6"></path>
          <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
        </svg>
      );
    default:
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
      );
  }
}

export default function HomeTools({ manifests }: { manifests: ToolManifest[] }) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categories = useMemo(() => {
    return ["all", ...Array.from(new Set(manifests.map((m) => m.category)))];
  }, [manifests]);

  const filtered = useMemo(() => {
    return manifests.filter((m) => {
      const matchesCategory = selectedCategory === "all" || m.category === selectedCategory;
      const term = search.toLowerCase().trim();
      const matchesSearch =
        !term ||
        m.title.toLowerCase().includes(term) ||
        m.description.toLowerCase().includes(term) ||
        m.id.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [manifests, selectedCategory, search]);

  return (
    <>
      <section className="hero-section">
        <h1 className="hero-title">
          Every PDF Tool You Need,{" "}
          <span style={{ color: "var(--primary)" }}>Free & Online</span>
        </h1>
        <p className="hero-desc">
          Merge, split, rotate and transform your PDF files — fast, private, and all in your browser.
        </p>
      </section>

      <div className="filter-bar">
        <div className="search-input-wrapper">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="category-tabs">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`category-tab ${selectedCategory === cat ? "active" : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === "all" ? "All" : cat}
            </button>
          ))}
        </div>
      </div>

      <section className="tools-section">
        <div className="section-heading">
          <h2 className="section-title">
            All Tools
            <span className="section-count">({filtered.length})</span>
          </h2>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted)" }}>
            <p>No tools found matching "{search}".</p>
            <button
              onClick={() => { setSearch(""); setSelectedCategory("all"); }}
              className="btn-secondary"
              style={{ marginTop: "1rem" }}
            >
              Reset Search
            </button>
          </div>
        ) : (
          <ul className="tools-grid">
            {filtered.map((m) => (
              <li key={m.id}>
                <Link href={`/tools/${m.id}`} className="tool-card">
                  <div className="tool-card-header">
                    <div className="tool-icon-box">{getToolIcon(m.id)}</div>
                    <span className="tool-badge">{m.category}</span>
                  </div>
                  <h3 className="tool-card-title">{m.title}</h3>
                  <p className="tool-card-desc">{m.description}</p>
                  <div className="tool-card-footer">
                    <span>
                      Open
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                      </svg>
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
