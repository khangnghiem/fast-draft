import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("VS Code webview regressions", () => {
  it("keeps canvas multi-selection messages handled by the extension host", () => {
    const syncSource = readRepoFile("webview/src/sync.js");
    const extensionSource = readRepoFile("src/extension.ts");

    expect(syncSource).toContain('type: "nodesSelected"');
    expect(syncSource).toContain('type: "nodeSelected"');
    expect(extensionSource).toMatch(/case "nodeSelected":\s*case "nodesSelected":/s);
    expect(extensionSource).toContain("message.ids ?? (message.id ? [message.id] : [])");
  });

  it("positions the floating action bar from width/height bounds fields", () => {
    const contextMenuSource = readRepoFile("webview/src/context-menu.js");
    const generatedMainSource = readRepoFile("webview/main.js");

    expect(contextMenuSource).toContain("bounds.width * zoomLevel");
    expect(contextMenuSource).not.toContain("bounds.w * zoomLevel");
    expect(generatedMainSource).toContain("bounds.width * zoomLevel");
    expect(generatedMainSource).not.toContain("bounds.w * zoomLevel");
  });

  it("clears locked state from both docked and floating toolbars on keyboard tool switch", () => {
    const shortcutsSource = readRepoFile("webview/src/shortcuts.js");
    const generatedMainSource = readRepoFile("webview/main.js");
    const toolbarSelector = '".tool-btn[data-tool], .ft-tool-btn[data-tool]"';

    expect(shortcutsSource).toContain(toolbarSelector);
    expect(generatedMainSource).toContain(toolbarSelector);
    expect(shortcutsSource).not.toContain('".tool-btn[data-tool]"');
    expect(generatedMainSource).not.toContain('".tool-btn[data-tool]"');
  });
});
