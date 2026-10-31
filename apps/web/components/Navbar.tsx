"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useState,
  useEffect,
  useRef,
  Suspense,
} from "react";
import {
  buildSearchTarget,
  SEARCH_DEBOUNCE_MS,
  NAV_GROUPS,
  type NavGroup,
  type NavGroupItem,
} from "../lib/nav";
import { NavToolIcon } from "./NavToolIcon";

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------

function NavSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const urlQuery = searchParams.get("q") ?? "";

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

  useEffect(() => {
    if (value.trim() === urlQuery.trim()) return;
    const timer = setTimeout(() => performNavigation(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, urlQuery, performNavigation]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
    []
  );

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

// ---------------------------------------------------------------------------
// Single MenuItem helper
// ---------------------------------------------------------------------------

interface ToolMenuItemProps {
  item: NavGroupItem;
  currentPath: string;
  onSelect: () => void;
}

function ToolMenuItem({ item, currentPath, onSelect }: ToolMenuItemProps) {
  const isItemActive = item.href !== null && currentPath.startsWith(item.href);

  if (item.href === null) {
    return (
      <span
        className="nav-dropdown-item nav-dropdown-item--planned"
        role="menuitem"
        aria-disabled="true"
      >
        <span className="nav-item-icon">
          <NavToolIcon iconId={item.iconId} size={18} />
        </span>
        <span className="nav-item-label">{item.label}</span>
        <span className="nav-coming-badge" aria-label="Coming soon">
          Soon
        </span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className={`nav-dropdown-item${isItemActive ? " nav-dropdown-item--active" : ""}`}
      role="menuitem"
      onClick={onSelect}
    >
      <span className="nav-item-icon">
        <NavToolIcon iconId={item.iconId} size={18} />
      </span>
      <span className="nav-item-label">{item.label}</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Generic single-group dropdown (used for "Convert PDF")
// ---------------------------------------------------------------------------

interface GroupDropdownProps {
  label: string;
  groups: NavGroup[];
  currentPath: string;
}

function GroupDropdown({ label, groups, currentPath }: GroupDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = groups.some((g) =>
    g.items.some((item) => item.href !== null && currentPath.startsWith(item.href))
  );

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 220);
  }, []);

  const handleClose = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOpen(false);
  }, []);

  const handleToggle = useCallback(() => setOpen((v) => !v), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    },
    [handleClose]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, handleClose]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="nav-group-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={`nav-group-trigger${isActive ? " nav-group-trigger--active" : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
      >
        {label}
        <svg
          className="nav-group-chevron"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="nav-dropdown nav-dropdown--columns" role="menu">
          {groups.map((group) => (
            <div key={group.label} className="nav-dropdown-section">
              <span className="nav-dropdown-section-label">{group.label}</span>
              {group.items.map((item) => (
                <ToolMenuItem
                  key={item.label}
                  item={item}
                  currentPath={currentPath}
                  onSelect={handleClose}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "All PDF Tools" mega-menu — shows ALL groups in a wide multi-column panel
// ---------------------------------------------------------------------------

interface AllToolsMegaMenuProps {
  currentPath: string;
}

function AllToolsMegaMenu({ currentPath }: AllToolsMegaMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topCategories = NAV_GROUPS.slice(0, 6);
  const bottomCategories = NAV_GROUPS.slice(6);

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setOpen(false);
    }, 220);
  }, []);

  const handleClose = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setOpen(false);
  }, []);

  const handleToggle = useCallback(() => setOpen((v) => !v), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    },
    [handleClose]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, handleClose]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="nav-group-wrapper nav-group-wrapper--megamenu"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className="nav-group-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
      >
        All PDF Tools
        <svg
          className="nav-group-chevron"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="nav-megamenu-panel" role="menu">
          {/* Top Row: 6 Columns */}
          <div className="nav-megamenu-grid">
            {topCategories.map((group) => (
              <div key={group.label} className="nav-megamenu-col">
                <span className="nav-dropdown-section-label">{group.label}</span>
                <div className="nav-megamenu-list">
                  {group.items.map((item) => (
                    <ToolMenuItem
                      key={item.label}
                      item={item}
                      currentPath={currentPath}
                      onSelect={handleClose}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Section: PDF Intelligence */}
          {bottomCategories.length > 0 && (
            <div className="nav-megamenu-bottom">
              {bottomCategories.map((group) => (
                <div key={group.label} className="nav-megamenu-col nav-megamenu-col--bottom">
                  <span className="nav-dropdown-section-label">{group.label}</span>
                  <div className="nav-megamenu-list nav-megamenu-list--row">
                    {group.items.map((item) => (
                      <ToolMenuItem
                        key={item.label}
                        item={item}
                        currentPath={currentPath}
                        onSelect={handleClose}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Navbar
// ---------------------------------------------------------------------------

export default function Navbar() {
  const pathname = usePathname();

  // The "Convert PDF" dropdown combines Convert To + Convert From groups
  const convertGroups = NAV_GROUPS.filter((g) =>
    g.label.startsWith("Convert")
  );

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

        {/* Nav items */}
        <nav className="header-nav" aria-label="Main navigation">
          {/* Direct tool links */}
          <Link
            href="/tools/merge"
            className={`nav-link nav-link--bold${pathname.startsWith("/tools/merge") ? " nav-link-active" : ""}`}
          >
            Merge PDF
          </Link>
          <Link
            href="/tools/split"
            className={`nav-link nav-link--bold${pathname.startsWith("/tools/split") ? " nav-link-active" : ""}`}
          >
            Split PDF
          </Link>
          <span
            className="nav-link nav-link--bold nav-link--muted"
            aria-disabled="true"
            title="Coming soon"
          >
            Compress PDF
          </span>

          {/* Convert PDF grouped dropdown */}
          <GroupDropdown
            label="Convert PDF"
            groups={convertGroups}
            currentPath={pathname}
          />

          {/* All PDF Tools mega-menu */}
          <AllToolsMegaMenu currentPath={pathname} />
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
