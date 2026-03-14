/**
 * Keyboard Shortcut Mapping
 *
 * Shared shortcut definitions and matcher for all FD canvas platforms.
 * Platform differences (⌘ vs Ctrl) are handled by the `metaKey` flag.
 */

// ── Types ────────────────────────────────────────────────────────────

/** A keyboard shortcut definition. */
export interface Shortcut {
  /** Action name (e.g. "undo", "select-tool"). */
  action: string;
  /** Required key (lowercase, e.g. "z", "delete", "escape"). */
  key: string;
  /** Require Cmd/Ctrl. */
  meta?: boolean;
  /** Require Shift. */
  shift?: boolean;
  /** Require Alt/Option. */
  alt?: boolean;
}

/** A shortcut map is an array of shortcut definitions. */
export type ShortcutMap = Shortcut[];

// ── Default Shortcuts ────────────────────────────────────────────────

/** Default FD canvas shortcuts — shared across all platforms. */
export const DEFAULT_SHORTCUTS: ShortcutMap = [
  // ── Tools ──────────────────────────────────────────────────────
  { action: "tool:select", key: "v" },
  { action: "tool:hand", key: "h" },
  { action: "tool:rect", key: "r" },
  { action: "tool:ellipse", key: "o" },
  { action: "tool:text", key: "t" },
  { action: "tool:pen", key: "p" },
  { action: "tool:frame", key: "f" },
  { action: "tool:arrow", key: "l" },
  { action: "tool:eraser", key: "e" },

  // ── Edit ───────────────────────────────────────────────────────
  { action: "undo", key: "z", meta: true },
  { action: "redo", key: "z", meta: true, shift: true },
  { action: "delete", key: "delete" },
  { action: "delete", key: "backspace" },
  { action: "select-all", key: "a", meta: true },
  { action: "duplicate", key: "d", meta: true },
  { action: "copy", key: "c", meta: true },
  { action: "paste", key: "v", meta: true },
  { action: "cut", key: "x", meta: true },
  { action: "copy-style", key: "c", meta: true, alt: true },
  { action: "paste-style", key: "v", meta: true, alt: true },

  // ── Z-order ────────────────────────────────────────────────────
  { action: "bring-forward", key: "]", meta: true },
  { action: "send-backward", key: "[", meta: true },
  { action: "bring-to-front", key: "]", meta: true, shift: true },
  { action: "send-to-back", key: "[", meta: true, shift: true },

  // ── View ───────────────────────────────────────────────────────
  { action: "zoom-in", key: "=", meta: true },
  { action: "zoom-out", key: "-", meta: true },
  { action: "zoom-fit", key: "0", meta: true },
  { action: "zoom-100", key: "1", meta: true },

  // ── Escape ─────────────────────────────────────────────────────
  { action: "escape", key: "escape" },
];

// ── Matcher ──────────────────────────────────────────────────────────

/**
 * Match a keyboard event against the shortcut map.
 * Returns the action name if matched, or `null` if no match.
 *
 * The matcher ignores events where the target is an input, textarea,
 * or contenteditable element (to avoid intercepting text editing).
 */
export function matchShortcut(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  map: ShortcutMap = DEFAULT_SHORTCUTS
): string | null {
  const key = event.key.toLowerCase();
  const meta = event.metaKey || event.ctrlKey; // ⌘ on Mac, Ctrl on Windows/Linux

  for (const shortcut of map) {
    if (shortcut.key !== key) continue;
    if ((shortcut.meta ?? false) !== meta) continue;
    if ((shortcut.shift ?? false) !== event.shiftKey) continue;
    if ((shortcut.alt ?? false) !== event.altKey) continue;
    return shortcut.action;
  }

  return null;
}
