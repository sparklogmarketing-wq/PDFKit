"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Unhandled client error in ErrorBoundary:", error);
  }, [error]);

  return (
    <div
      className="error-boundary-container"
      style={{
        padding: "4rem 1rem",
        textAlign: "center",
        maxWidth: "36rem",
        margin: "0 auto",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: "var(--danger-subtle)",
          color: "var(--danger)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 1.5rem",
          border: "1px solid var(--danger-border)",
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h1
        style={{
          fontSize: "1.75rem",
          fontWeight: 800,
          color: "var(--text-main)",
          marginBottom: "0.5rem",
        }}
      >
        Something Went Wrong
      </h1>

      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.9375rem",
          marginBottom: "2rem",
          lineHeight: 1.6,
        }}
      >
        An unexpected error occurred while rendering this page. You can retry the operation or return to the tool catalog.
      </p>

      {error.message && (
        <div
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
            marginBottom: "2rem",
            fontFamily: "var(--font-mono)",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
            textAlign: "left",
            wordBreak: "break-word",
          }}
        >
          {error.message}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => reset()}
          className="btn-primary"
          style={{ minWidth: "8rem" }}
        >
          Try Again
        </button>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "8rem",
            padding: "0.75rem 1.5rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-medium)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-main)",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
