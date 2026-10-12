"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect, Suspense } from "react";

const TOOL_LINKS = [
  { href: "/", label: "All Tools" },
  { href: "/tools/merge", label: "Merge PDF" },
  { href: "/tools/split", label: "Split PDF" },
  { href: "/tools/rotate", label: "Rotate PDF" },
];

function NavSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  /* Keep input in sync if URL changes externally */
  useEffect(() => {
    setValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setValue(next);
      /* Only push search param when on the home page */
      if (pathname === "/") {
        const params = new URLSearchParams(searchParams.toString());
        if (next) {
          params.set("q", next);
        } else {
          params.delete("q");
        }
        router.replace(`/?${params.toString()}`, { scroll: false });
      } else {
        /* Navigate to home with query so HomeTools can filter */
        router.push(next ? `/?q=${encodeURIComponent(next)}` : "/");
      }
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="nav-search-wrapper">
      <svg
        className="nav-search-icon"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        className="nav-search-input"
        placeholder="Search tools…"
        value={value}
        onChange={handleChange}
        aria-label="Search PDF tools"
      />
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="site-header-inner">
        {/* Brand */}
        <div className="brand-group">
          <Link href="/" className="brand-link">
            <span className="brand-logo">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </span>
            <span>PDFKit</span>
          </Link>
        </div>

        {/* Centre nav links */}
        <nav className="header-nav" aria-label="Main navigation">
          {TOOL_LINKS.map(({ href, label }) => {
            const isActive =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`nav-link${isActive ? " nav-link-active" : ""}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right: search */}
        <div className="header-actions">
          <Suspense fallback={<div className="nav-search-wrapper" />}>
            <NavSearch />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
