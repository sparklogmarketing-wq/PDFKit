import Link from "next/link";
import { notFound } from "next/navigation";
import ToolRunner from "../../../components/ToolRunner";
import SplitTool from "../../../components/SplitTool";
import RotateTool from "../../../components/RotateTool";
import OrganizeTool from "../../../components/OrganizeTool";
import { ToolIcon } from "../../../components/ToolIcon";
import { manifests } from "../../../lib/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return manifests.map((m) => ({ id: m.id }));
}

export default async function ToolPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manifest = manifests.find((m) => m.id === id);
  if (!manifest) notFound();

  const categoryLabel = manifest.category;
  const isActive = (manifest as any).status === "active";

  const relatedTools = manifests
    .filter((m) => m.id !== id && (m.category === manifest.category || (m as any).status === "active"))
    .slice(0, 4);

  // Resolve tool component based on id to avoid nested ternary
  let toolComponent: React.ReactNode;
  if (id === "split") {
    toolComponent = <SplitTool />;
  } else if (id === "rotate") {
    toolComponent = <RotateTool />;
  } else if (id === "organize") {
    toolComponent = <OrganizeTool />;
  } else {
    toolComponent = <ToolRunner manifest={manifest} />;
  }

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
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <h1 className="tool-page-title" style={{ margin: 0 }}>{manifest.title}</h1>
                <span className={`tool-badge ${isActive ? "active" : "planned"}`}>
                  {isActive ? "Ready" : "Planned"}
                </span>
              </div>
              <p className="tool-page-desc" style={{ marginTop: "0.25rem" }}>{manifest.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tool body */}
      {toolComponent}

      {/* Related tools */}
      {relatedTools.length > 0 && (
        <div style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid var(--border-light)" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "1rem" }}>
            Related Tools
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))", gap: "1rem" }}>
            {relatedTools.map((t) => {
              const tIsActive = (t as any).status === "active";
              return (
                <Link
                  key={t.id}
                  href={`/tools/${t.id}`}
                  className="tool-card"
                  style={{ padding: "1rem" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ color: "var(--primary)" }}>
                        <ToolIcon id={t.id} size={24} />
                      </div>
                      <strong style={{ fontSize: "0.9375rem" }}>{t.title}</strong>
                    </div>
                    <span className={`tool-badge ${tIsActive ? "active" : "planned"}`}>
                      {tIsActive ? "Ready" : "Planned"}
                    </span>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
                    {t.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
