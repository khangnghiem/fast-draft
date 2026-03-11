/**
 * Platform Host Interface
 *
 * Each platform (VS Code, Web, Tauri, iOS) implements this interface
 * to provide platform-specific capabilities to the shared canvas UI.
 *
 * The fd-canvas-ui module calls these methods instead of using
 * platform-specific APIs directly.
 */
export interface PlatformHost {
  // ── Document I/O ──────────────────────────────────────────────────

  /** Get the current .fd document text. */
  getDocument(): string;

  /** Set the .fd document text (triggers bidi sync). */
  setDocument(text: string): void;

  // ── UI Feedback ───────────────────────────────────────────────────

  /** Show a brief toast notification. */
  showToast(message: string, durationMs?: number): void;


  // ── State Persistence ─────────────────────────────────────────────

  /** Persist a key-value pair (survives tab reload). */
  persistState(key: string, value: unknown): void;

  /** Load a previously persisted value. */
  loadState<T = unknown>(key: string): T | null;

  // ── Platform-Specific (Optional) ──────────────────────────────────

  /**
   * Post a message to the host (VS Code extension, Tauri backend).
   * Not available on standalone web — callers must check before use.
   */
  postMessage?(message: unknown): void;

  /**
   * Read text from the system clipboard.
   * Not available in all contexts (e.g., VS Code webview).
   */
  readClipboard?(): Promise<string>;

  /**
   * Write text to the system clipboard.
   * Not available in all contexts.
   */
  writeClipboard?(text: string): Promise<void>;

  /**
   * Get the device pixel ratio (for HiDPI canvas rendering).
   * Defaults to `window.devicePixelRatio` on web.
   */
  getDevicePixelRatio?(): number;
}
