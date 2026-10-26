# CSS Architecture and Ownership

## Overview

PDFKit uses standard CSS organized centrally in `apps/web/app/globals.css`. This document defines the architectural boundaries, ownership layers, naming conventions, and best practices to ensure consistent styling, eliminate duplicate declarations, and prevent inline style bloat.

---

## Ownership Layers

| Layer | Responsibility | Primary Selectors / Tokens | File Location |
|---|---|---|---|
| **Design Tokens** | Global color palette, typography scale, radii, elevation shadows, transitions, spacing | `:root { --primary, --text-main, --radius-md, ... }` | `globals.css` (lines 1–65) |
| **Reset & Typography** | Base box-sizing, html/body typography, headings, inputs, scrollbars | `*, body, h1-h6, input, button` | `globals.css` (lines 65–110) |
| **Global Layout** | Main application shell, sticky navigation bar, search bar, footer | `.site-header, .site-nav, .site-footer, .nav-search` | `globals.css` (lines 110–300) |
| **Shared Tool Infrastructure** | Dropzones, action buttons, progress bars, zoom modal, 2-column workspace grids | `.tool-dropzone, .btn-primary, .progress-bar, .modal-*, .workspace-*, .tool-sticky-panel` | `globals.css` (lines 580–1200, 2270–2350) |
| **Feedback Banners** | User alerts (errors, warnings, success, info) | `.alert-error, .alert-warning, .alert-success, .alert-info` | `globals.css` (Single canonical source) |
| **Output Presentation** | Output cards, multi-file ZIP actions, downloaded file lists | `.tool-results-*`, `.results-card` | `globals.css` |
| **Tool-Specific Panels** | Layout and control settings scoped to individual tools | `.merge-*, .split-*, .rotate-*, .organize-*, .remove-*, .extract-*` | `globals.css` (Tool sections) |

---

## Golden Rules

### 1. Single Source of Truth for Selectors
- Every global selector (e.g., `.alert-error`, `.alert-warning`) must be defined **once and only once**.
- Media queries should only override specific responsive properties (`grid-template-columns`, `display`, etc.), never redeclare base component styling.

### 2. Semantic Classes over Inline Styles
- Components must use semantic CSS classes instead of repetitive inline `style={{ ... }}` objects.
- Inline styles are reserved solely for **dynamic runtime values** computed from component state or user input (e.g., thumbnail rotation angles `transform: rotate(...)`, progress percentage `width: ...%`, or dynamic palette backgrounds).
- Layout (`maxWidth`, `padding`, `margin`, `display: flex`), typography (`fontSize`, `fontWeight`), and colors (`color`, `border`) must live in CSS classes.

### 3. Use Design Tokens
- Never use hardcoded hex values in component styling when a CSS variable exists.
- Always use `var(--text-main)`, `var(--text-secondary)`, `var(--primary)`, `var(--danger)`, `var(--border-light)`, etc.
- This ensures seamless future theme extensions (such as dark mode) and predictable visual hierarchy.

### 4. Component Class Namespaces
Tool-specific components must prefix their custom classes with their tool identifier:
- **Merge**: `.merge-settings-*`, `.merge-seq-*`, `.merge-summary-*`
- **Remove**: `.remove-settings-*`, `.remove-metric-*`, `.remove-field-*`, `.remove-confirm-*`
- **Extract**: `.extract-mode-*`, `.extract-submode-*`
- **Organize**: `.organize-tool-*`, `.organize-card-*`
- **Rotate**: `.rotate-workspace-*`, `.rotate-page-*`
- **Split**: `.split-mode-*`, `.split-range-*`
- **Shared Results**: `.tool-results-*`
- **Shared Workspace**: `.workspace-*`
