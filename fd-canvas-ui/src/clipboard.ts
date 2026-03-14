/**
 * Clipboard Operations
 *
 * Shared clipboard handling for all FD canvas platforms.
 * Supports copying/pasting nodes as FD text and style properties.
 */

import type { PlatformHost } from "./host.js";

// ── Node Clipboard (FD text) ─────────────────────────────────────────

/**
 * Copy selected node(s) as FD text to the system clipboard.
 * Falls back to in-memory clipboard if system clipboard is unavailable.
 */
export async function copyNodes(
  host: PlatformHost,
  fdText: string
): Promise<void> {
  if (host.writeClipboard) {
    await host.writeClipboard(fdText);
  } else {
    inMemoryClipboard = fdText;
  }
}

/**
 * Paste FD text from the system clipboard.
 * Falls back to in-memory clipboard if system clipboard is unavailable.
 */
export async function pasteNodes(host: PlatformHost): Promise<string> {
  if (host.readClipboard) {
    return await host.readClipboard();
  }
  return inMemoryClipboard;
}

// ── Style Clipboard (in-memory only) ─────────────────────────────────

/** Stored style properties for Copy/Paste Style. */
let styleClipboard: Record<string, unknown> | null = null;

/** In-memory fallback for system clipboard. */
let inMemoryClipboard: string = "";

/**
 * Copy style properties to the style clipboard (in-memory).
 * Properties are a plain object with fill, stroke, corner, opacity, etc.
 */
export function copyStyle(props: Record<string, unknown>): void {
  styleClipboard = { ...props };
}

/**
 * Read the current style clipboard contents.
 * Returns `null` if no style has been copied.
 */
export function pasteStyle(): Record<string, unknown> | null {
  return styleClipboard ? { ...styleClipboard } : null;
}

/**
 * Check if the style clipboard has contents.
 */
export function hasStyleClipboard(): boolean {
  return styleClipboard !== null;
}
