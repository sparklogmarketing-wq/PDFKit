"use client";

interface ToolProgressBarProps {
  readonly progress: number | null;
  readonly statusMsg: string;
  readonly onCancel?: (() => void) | null;
}

export default function ToolProgressBar({
  progress,
  statusMsg,
  onCancel,
}: ToolProgressBarProps) {
  const percent = Math.round((progress ?? 0) * 100);

  return (
    <div>
      <div
        style={{
          width: "100%",
          height: 8,
          borderRadius: 99,
          background: "var(--border-light)",
          overflow: "hidden",
          marginBottom: "0.6rem",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: "var(--primary)",
            borderRadius: 99,
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", textAlign: "center", marginBottom: "0.75rem" }}>
        {statusMsg}
      </p>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          style={{
            width: "100%",
            padding: "0.5rem",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--danger-border)",
            background: "var(--danger-subtle)",
            color: "var(--danger)",
            fontWeight: 700,
            fontSize: "0.8125rem",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
