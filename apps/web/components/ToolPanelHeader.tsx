"use client";

import type { ReactNode } from "react";

export interface ToolPanelHeaderProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly onClear?: () => void;
  readonly clearLabel?: string;
  readonly children?: ReactNode;
}

export default function ToolPanelHeader({
  title,
  description,
  onClear,
  clearLabel = "Clear All",
  children,
}: ToolPanelHeaderProps) {
  return (
    <div className="tool-panel-header">
      <div>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0.2rem 0 0 0" }}>
            {description}
          </p>
        )}
      </div>

      {(onClear || children) && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {children}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="tool-clear-btn"
            >
              {clearLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
