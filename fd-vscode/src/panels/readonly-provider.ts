/**
 * Read-only virtual document provider for filtered FD views.
 *
 * Uses VS Code's TextDocumentContentProvider to create a read-only tab
 * that shows the .fd document filtered by a ReadMode (Structure, Layout,
 * Design, Visual, Spec, When, Edges).
 *
 * The virtual document auto-updates when the canvas pushes changes.
 */

import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";

/** View modes matching fd-core's ReadMode enum. */
export type FdViewMode =
  | "full"
  | "structure"
  | "layout"
  | "design"
  | "spec"
  | "visual"
  | "when"
  | "edges";

/** Human-readable labels for the quick-pick menu. */
export const VIEW_MODE_LABELS: Record<FdViewMode, string> = {
  full: "$(file-code) Full",
  structure: "$(list-tree) Structure",
  layout: "$(layout) Layout",
  design: "$(paintcan) Design",
  spec: "$(checklist) Spec",
  visual: "$(eye) Visual",
  when: "$(zap) When (Animations)",
  edges: "$(git-merge) Edges (Flows)",
};

const SCHEME = "fd-readonly";

export class FdReadOnlyProvider
  implements vscode.TextDocumentContentProvider
{
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  /** Current filtered content keyed by source URI string. */
  private _contents = new Map<string, string>();

  /** Active view mode per source URI. */
  private _modes = new Map<string, FdViewMode>();

  /** Path to the fd-lsp binary (resolved once). */
  private _lspBinPath: string | undefined;

  constructor(private readonly extensionPath: string) {}

  provideTextDocumentContent(uri: vscode.Uri): string {
    const key = uri.query; // query = source URI toString
    return this._contents.get(key) ?? "// No content available";
  }

  /** Build a virtual URI for a given source document and mode. */
  static buildUri(sourceUri: vscode.Uri, mode: FdViewMode): vscode.Uri {
    const label = `${path.basename(sourceUri.fsPath, ".fd")} [${mode}].fd`;
    return vscode.Uri.parse(`${SCHEME}:${label}?${sourceUri.toString()}`);
  }

  /** Get the current mode for a source document. */
  getMode(sourceUri: vscode.Uri): FdViewMode {
    return this._modes.get(sourceUri.toString()) ?? "visual";
  }

  /** Set the mode and refresh the virtual document. */
  async setMode(
    sourceUri: vscode.Uri,
    mode: FdViewMode,
    sourceText: string
  ): Promise<void> {
    this._modes.set(sourceUri.toString(), mode);
    await this.updateContent(sourceUri, sourceText);
  }

  /** Update the virtual document content by running fd-lsp --view. */
  async updateContent(
    sourceUri: vscode.Uri,
    sourceText: string
  ): Promise<void> {
    const mode = this.getMode(sourceUri);

    if (mode === "full") {
      // No filtering needed — show full source
      this._contents.set(sourceUri.toString(), sourceText);
    } else {
      // Run fd-lsp --view <mode> to filter
      const filtered = await this._runFilter(sourceText, mode);
      this._contents.set(sourceUri.toString(), filtered);
    }

    const virtualUri = FdReadOnlyProvider.buildUri(sourceUri, mode);
    this._onDidChange.fire(virtualUri);
  }

  /** Execute fd-lsp --view <mode> and return filtered output. */
  private async _runFilter(
    text: string,
    mode: FdViewMode
  ): Promise<string> {
    const bin = this._resolveBin();
    if (!bin) {
      return `// fd-lsp binary not found — cannot filter\n// Mode: ${mode}`;
    }

    return new Promise((resolve) => {
      const proc = cp.spawn(bin, ["--view", mode], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          resolve(`// fd-lsp --view ${mode} failed (exit ${code})\n// ${stderr.trim()}`);
        }
      });

      proc.on("error", (err) => {
        resolve(`// fd-lsp --view ${mode} error: ${err.message}`);
      });

      proc.stdin.write(text);
      proc.stdin.end();
    });
  }

  /** Resolve the fd-lsp binary path from the extension's server directory. */
  private _resolveBin(): string | undefined {
    if (this._lspBinPath) return this._lspBinPath;

    // Try the bundled binary first
    const platform = process.platform;
    const ext = platform === "win32" ? ".exe" : "";
    const candidates = [
      path.join(this.extensionPath, "server", `fd-lsp${ext}`),
      path.join(this.extensionPath, "..", "..", "target", "debug", `fd-lsp${ext}`),
      path.join(this.extensionPath, "..", "..", "target", "release", `fd-lsp${ext}`),
    ];

    for (const candidate of candidates) {
      try {
        const stat = require("fs").statSync(candidate);
        if (stat.isFile()) {
          this._lspBinPath = candidate;
          return candidate;
        }
      } catch {
        // Not found, try next
      }
    }

    return undefined;
  }

  /** Dispose resources. */
  dispose(): void {
    this._onDidChange.dispose();
    this._contents.clear();
    this._modes.clear();
  }
}

export { SCHEME as FD_READONLY_SCHEME };
