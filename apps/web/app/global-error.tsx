"use client";

import { useEffect } from "react";
import Link from "next/link";

interface GlobalErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Unhandled root error in GlobalError:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          backgroundColor: "#f5f3ff",
          color: "#1e1333",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          margin: 0,
          padding: "1rem",
        }}
      >
        <div
          style={{
            maxWidth: "32rem",
            width: "100%",
            backgroundColor: "#ffffff",
            padding: "2.5rem",
            borderRadius: "16px",
            boxShadow: "0 4px 12px rgba(109,40,217,0.1)",
            textAlign: "center",
            border: "1px solid #e9e5ff",
          }}
        >
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: "0 0 0.5rem" }}>Application Error</h1>
          <p style={{ color: "#7c6fa0", fontSize: "0.9375rem", marginBottom: "2rem", lineHeight: 1.5 }}>
            A critical error interrupted the application. Please try reloading or return to the main page.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                backgroundColor: "#7c3aed",
                color: "#ffffff",
                border: "none",
                borderRadius: "10px",
                padding: "0.75rem 1.5rem",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Try Again
            </button>
            <Link
              href="/"
              style={{
                backgroundColor: "#ede9fe",
                color: "#4c3d6e",
                border: "none",
                borderRadius: "10px",
                padding: "0.75rem 1.5rem",
                fontWeight: 600,
                textDecoration: "none",
                fontSize: "0.875rem",
                display: "inline-block",
              }}
            >
              Go to Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
