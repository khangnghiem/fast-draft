# fd-shell — Layout Shell API

The FD UI shell uses a **data-attribute state machine** on `<html>` for all layout-critical state.
This ensures zero FOUC — the layout is correct from the browser's first paint.

## Data Attributes on `<html>`

| Attribute | Values | Purpose |
|-----------|--------|---------|
| `data-lp` | `"open"` / `"closed"` | Left panel visibility |
| `data-rp` | `"open"` / `"closed"` | Right panel visibility |
| `data-toolbar` | `"top"` / `"bottom"` / `"left"` / `"right"` | Toolbar dock side |
| `data-toolbar-min` | `"1"` / absent | Toolbar minimized state |

## CSS Custom Properties on `<html>`

| Property | Default | Purpose |
|----------|---------|---------|
| `--left-panel-width` | `280px` | Left panel grid column width |
| `--right-panel-width` | `320px` | Right panel grid column width |

## How It Works

1. **`<head>` script** reads `localStorage` and sets all data-attrs + CSS vars on `document.documentElement` synchronously — before `<body>` is parsed.
2. **CSS Grid** on `#canvas-content` uses these vars for `grid-template-columns`.
3. **CSS selectors** like `[data-lp="closed"]`, `[data-rp="open"]`, `[data-toolbar="top"]` drive all layout — no JS class toggles needed for initial render.
4. **JS** (`app.js`) updates `document.documentElement.dataset.*` and `document.documentElement.style` when the user interacts (panel toggle, toolbar drag).

## Multi-Platform Usage

Any platform (web site, VS Code webview, Tauri desktop) can use this pattern:

```html
<html data-lp="open" data-rp="open" data-toolbar="top"
      style="--left-panel-width: 280px; --right-panel-width: 320px">
```

The shell layout works from these attributes alone — no JavaScript needed for the initial frame.

## Grid Layout

```
#canvas-content:
┌──────────────┬─────────────────────┬───────────────┐
│  left-panel  │    canvas (1fr)     │  right-panel  │
│  col 1       │    col 2            │  col 3        │
└──────────────┴─────────────────────┴───────────────┘
```

On mobile (≤768px), panels become absolutely-positioned overlays and the grid collapses to `1fr`.
