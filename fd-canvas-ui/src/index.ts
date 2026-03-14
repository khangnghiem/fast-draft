/**
 * fd-canvas-ui — Shared Canvas UI Module
 *
 * Cross-platform UI module for FD's Code & Canvas experience.
 * Consolidates pointer routing, panels, render loop, sync, clipboard,
 * and shortcuts into a single package consumed by all platforms.
 *
 * ## Architecture
 *
 * Each platform implements the `PlatformHost` interface to provide
 * platform-specific capabilities. The shared modules then handle all
 * UI logic identically across:
 *
 * - **Web** (fast-draft.com playground)
 * - **VS Code** (custom editor webview)
 * - **Tauri** (desktop app webview)
 * - **iOS** / **Android** (native via WKWebView / WebView)
 *
 * ## Usage
 *
 * ```typescript
 * import { PlatformHost, getTheme, matchShortcut, DEFAULT_SHORTCUTS } from 'fd-canvas-ui';
 *
 * const host: PlatformHost = {
 *   getDocument: () => editor.getText(),
 *   setDocument: (text) => editor.setText(text),
 *   showToast: (msg) => console.log(msg),
 *   getTheme: () => 'light',
 *   persistState: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
 *   loadState: (k) => JSON.parse(localStorage.getItem(k) ?? 'null'),
 * };
 * ```
 */

// ── Core interfaces ─────────────────────────────────────────────────
export type { PlatformHost } from "./host.js";

// ── Theme ───────────────────────────────────────────────────────────
export type { ThemeContract } from "./theme.js";
export { LIGHT_THEME, getTheme } from "./theme.js";

// ── Pointer ─────────────────────────────────────────────────────────
export type { ScenePoint, PointerState, GestureKind, ViewportTransform } from "./pointer.js";
export {
  createPointerState,
  viewportToScene,
  classifyGesture,
  pinchDistance,
  pinchMidpoint,
} from "./pointer.js";

// ── Keyboard Shortcuts ──────────────────────────────────────────────
export type { Shortcut, ShortcutMap } from "./shortcuts.js";
export { DEFAULT_SHORTCUTS, matchShortcut } from "./shortcuts.js";

// ── Clipboard ───────────────────────────────────────────────────────
export {
  copyNodes,
  pasteNodes,
  copyStyle,
  pasteStyle,
  hasStyleClipboard,
} from "./clipboard.js";
