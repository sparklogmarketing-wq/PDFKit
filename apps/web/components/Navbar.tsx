"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect, Suspense, useMemo } from "react";
import {
  deriveNavLinks,
  buildSearchTarget,
  SEARCH_DEBOUNCE_MS,
  type NavLinkItem,
} from "../lib/nav";

export const TOOL_LINKS: NavLinkItem[] = deriveNavLinks();

function NavSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  const urlQuery = searchParams.get("q") ?? "";

  /* Keep input in sync if URL changes externally (e.g. Back/Forward) */
  useEffect(() => {
    setValue(urlQuery);
  }, [urlQuery]);

  const performNavigation = useCallback(
    (targetQuery: string) => {
      const decision = buildSearchTarget(
        targetQuery,
        pathname,
        new URLSearchParams(searchParams.toString())
      );
      if (decision.action === "replace") {
        router.replace(decision.url, { scroll: false });
      } else if (decision.action === "push") {
        router.push(decision.url);
      }
    },
    [pathname, router, searchParams]
  );

  /* Debounce navigation while typing */
  useEffect(() => {
    if (value.trim() === urlQuery.trim()) {
      return;
    }

    const timer = setTimeout(() => {
      performNavigation(value);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [value, urlQuery, performNavigation]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      performNavigation(value);
    },
    [performNavigation, value]
  );

  return (
    <form className="nav-search-wrapper" onSubmit={handleSubmit} role="search">
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
        type="search"
        className="nav-search-input"
        placeholder="Search tools…"
        value={value}
        onChange={handleChange}
        aria-label="Search PDF tools"
      />
    </form>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const links = useMemo(() => deriveNavLinks(), []);

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
          {links.map(({ href, label }) => {
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
