---
name: check-styles
description: Scan TSX components for violations of specs/STYLES.md (the alibi design system). Use when the user asks to audit styling, check design-system compliance, or find non-compliant components. Reports inline styles, banned utilities (backdrop-blur, border-2, rounded-3xl), deprecated ui-styles.ts imports, and custom shadow/color values that should use named classes.
---

# Check Styles Skill

Audits `components/`, `app/`, and other TSX surfaces against `specs/STYLES.md`. Read that file first if you have not in this session — the rules below derive from it and may drift.

## Step 1 — Define scan scope

Default scan paths: `app/` and `components/`.

If the user named a specific file/folder, scan only that. If they said "everything," include `app/`, `components/`, and any TSX under the repo root excluding `node_modules`, `.next`, and `test-results`.

Skip `lib/ui-styles.ts` itself (it's the deprecated file the rules ban). Skip generated files.

## Step 2 — Run the rule checks in parallel

Run each `rg` (ripgrep) check in parallel from the repo root. Use `--type tsx --type ts` and exclude `node_modules`, `.next`. For each finding, capture `file:line:matched-snippet`.

### Rule 1 — No glass / blur
**Severity: high**

```
rg -n --type tsx --type ts 'backdrop-blur|backdrop-filter|bg-white/(?:60|65|70|75|80|85|90|95)' app components
```

Any match is a violation — STYLES.md §"no glass" forbids these. Surfaces must be solid `bg-white`.

### Rule 2 — Border weight
**Severity: high**

```
rg -n --type tsx --type ts '\bborder-[2-8]\b' app components
```

`border-2`+ is banned. Always 1px (`border`). Adjust visual weight with border-color opacity.

### Rule 3 — Border radius scale
**Severity: high**

```
rg -n --type tsx --type ts 'rounded-3xl|rounded-\[[^\]]+\]|rounded-(?:sm|md|lg)\b' app components
```

Only `rounded-2xl` (surfaces), `rounded-xl` (sidebar nav hover only), and `rounded-full` (pills/chips/icon buttons) are allowed. Flag `rounded-3xl`, custom `rounded-[Xpx]`, and `rounded-sm|md|lg`.

### Rule 4 — Inline style with color/surface/shadow
**Severity: high (with allowlist)**

```
rg -n --type tsx --type ts 'style=\{\{' app components
```

For each hit, read the file around the match. **Allowed**: dynamic chart / data-viz values (calendar density cells, chart fills) — usually in `components/dashboard/`, `components/calendar-*`, or files importing chart libraries. **Disallowed**: hardcoded `backgroundColor`, `boxShadow`, `border`, `color` that could be a named class.

If unsure, flag it for review rather than silently skipping.

### Rule 5 — Deprecated `lib/ui-styles.ts` imports
**Severity: medium**

```
rg -n --type tsx --type ts "from ['\"].*lib/ui-styles['\"]|GLASS_PANEL_STYLE|GLASS_PILL_STYLE|PAPER_INSET_STYLE|PRIMARY_BUTTON_STYLE|ALIBI\\." app components
```

`lib/ui-styles.ts` is deprecated. Map to replacements per the table at the bottom of STYLES.md (e.g. `GLASS_PANEL_STYLE` → `.alibi-card`).

### Rule 6 — Hex color literals in JSX
**Severity: medium (with allowlist)**

```
rg -n --type tsx '#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b' app components
```

Hex codes belong in `app/globals.css` only. Allowed in TSX **only** for dynamic chart fills computed at render time (same palette — no new colors). Flag any hex that isn't inside a chart/data-viz computation.

### Rule 7 — Custom shadow that duplicates a named pattern
**Severity: low-medium**

```
rg -n --type tsx --type ts 'shadow-\[' app components
```

Inline `shadow-[...]` is OK only for dynamic values (calendar cells). For static surfaces, the equivalent should be a named class (`alibi-card`, `alibi-card-pop`, `alibi-inset`, `alibi-block-item`, `alibi-doc-card`). For each match, compare the pattern to the table in STYLES.md §"shadow system." If it matches a named pattern exactly, flag it as a refactor candidate.

### Rule 8 — Off-palette color utilities
**Severity: medium**

```
rg -n --type tsx --type ts '(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|cyan|sky|indigo|violet|purple|fuchsia|rose)-[0-9]+' app components
```

Only `alibi-*` tokens are allowed. Tailwind's default palette names indicate drift from the design system.

### Rule 9 — Icon buttons with wrong radius
**Severity: low**

After Rule 3 runs, look for icon buttons (h-9 w-9, h-8 w-8, h-10 w-10 with a single child icon). STYLES.md §"Icon action buttons" requires `rounded-full`. If you see `rounded-2xl` on a square icon-only button, flag it.

This rule needs visual inspection — surface the candidates from:

```
rg -n --type tsx 'h-(?:8|9|10|11)\s+w-(?:8|9|10|11)' app components
```

…and read the surrounding context to judge.

## Step 3 — Report

Group findings by rule, severity-descending. For each finding:

```
<rule name> · <severity>
  <file>:<line>  <snippet>
  → <suggested fix>
```

End with a one-line summary: `N violations across M files. Highest-severity: …`.

If zero violations: say so plainly. Do not invent findings to look thorough.

## Step 4 — Offer to fix

After the report, ask the user if they want fixes applied. Fix in this order:
1. Mechanical replacements (`border-2` → `border`, deprecated import → class).
2. Inline-style migrations (compare against the named classes; only fix if the mapping is unambiguous).
3. Shadow consolidation (replace inline `shadow-[…]` with the matching `.alibi-*` class).

Do not bulk-fix without confirmation. If a finding is ambiguous (e.g. an inline style with computed values), explain the ambiguity and leave it to the user.

## Notes

- The rules above derive from `specs/STYLES.md` as of 2026-05. If STYLES.md changes substantively, update this skill's grep patterns.
- This skill is read-only by default — it only writes when the user approves fixes in Step 4.
- `components/dashboard/` and `components/calendar-*` legitimately use inline styles for dynamic chart values; bias toward "review" rather than "violation" there.
