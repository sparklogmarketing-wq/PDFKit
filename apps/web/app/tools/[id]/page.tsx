import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ToolIcon } from "../../../components/ToolIcon";
import { manifests } from "../../../lib/registry";
import { getRelatedTools } from "../../../lib/relatedTools";
import { ToolView } from "../../../lib/toolComponents";

import { getToolMetadataById } from "../../../lib/toolMetadata";

export const dynamicParams = false;

export function generateStaticParams() {
  const ids = manifests.map((m) => m.id);
  if (!ids.includes("png-to-pdf")) {
    ids.push("png-to-pdf");
  }
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return getToolMetadataById(id);
}

export default async function ToolPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const canonicalId = id === "png-to-pdf" ? "jpg-to-pdf" : id;
  const manifest = manifests.find((m) => m.id === canonicalId);
  if (!manifest) notFound();

  const categoryLabel = manifest.category;
  const relatedTools = getRelatedTools(manifest, manifests);

  return (
    <div>
      {/* Header */}
      <div className="tool-page-header">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span>{categoryLabel}</span>
          <span className="breadcrumb-separator">/</span>
          <span style={{ color: "var(--text-main)", fontWeight: 600 }}>{manifest.title}</span>
        </nav>

        <div className="tool-header-content">
          <div className="tool-title-wrapper">
            <div className="tool-page-icon">
              <ToolIcon id={manifest.id} size={26} />
            </div>
            <div>
              <h1 className="tool-page-title" style={{ margin: 0 }}>{manifest.title}</h1>
              <p className="tool-page-desc" style={{ marginTop: "0.25rem" }}>{manifest.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Tool Workspace */}
      <ToolView id={id} manifest={manifest} />

      {/* Related tools */}
      {relatedTools.length > 0 && (
        <div style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid var(--border-light)" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
            Related Tools
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))", gap: "1rem" }}>
            {relatedTools.map((t) => (
              <Link
                key={t.id}
                href={`/tools/${t.id}`}
                className="tool-card"
                style={{ padding: "1rem" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <div style={{ color: "var(--primary)" }}>
                    <ToolIcon id={t.id} size={24} />
                  </div>
                  <strong style={{ fontSize: "0.9375rem" }}>{t.title}</strong>
                </div>
                <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
                  {t.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
