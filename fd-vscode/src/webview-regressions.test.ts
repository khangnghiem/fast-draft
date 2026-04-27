import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function readWebviewSource(name: string): string {
  return readFileSync(path.resolve(__dirname, "../webview/src", name), "utf8");
}

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote: '"' | "'" | "`" | null = null;
  let escaped = false;

  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error(`Unterminated function ${name}`);
}

function createClassList() {
  const values = new Set<string>();
  return {
    add: (name: string) => values.add(name),
    remove: (name: string) => values.delete(name),
    contains: (name: string) => values.has(name),
    toggle: (name: string, force?: boolean) => {
      const shouldAdd = force ?? !values.has(name);
      if (shouldAdd) values.add(name);
      else values.delete(name);
      return shouldAdd;
    },
  };
}

function createToolButton(tool: string) {
  return {
    classList: createClassList(),
    getAttribute: (name: string) => (name === "data-tool" ? tool : null),
  };
}

describe("VS Code webview regressions", () => {
  it("keeps canvas multi-selection messages handled by the extension host", () => {
    const syncSource = readWebviewSource("sync.js");
    const extensionSource = readFileSync(path.resolve(__dirname, "../src/extension.ts"), "utf8");

    expect(syncSource).toContain('type: "nodesSelected"');
    expect(syncSource).toContain('type: "nodeSelected"');
    expect(extensionSource).toMatch(/case "nodeSelected":\s*case "nodesSelected":/s);
    expect(extensionSource).toContain("message.ids ?? (message.id ? [message.id] : [])");
  });

  it("posts nodeSelected for a single canvas selection", () => {
    const messages: unknown[] = [];
    const context = vm.createContext({
      fdCanvas: {
        get_selected_ids: () => JSON.stringify(["card"]),
      },
      vscode: { postMessage: (message: unknown) => messages.push(message) },
      render: () => undefined,
      refreshLayersPanel: () => undefined,
      focusOnNode: () => undefined,
      updatePropertiesPanel: () => undefined,
      updateFloatingBar: () => undefined,
      hideFloatingBar: () => undefined,
      window: { addEventListener: () => undefined },
      setTimeout,
      clearTimeout,
    });

    vm.runInContext(readWebviewSource("sync.js"), context);
    vm.runInContext(`syncSelection("card", "canvas")`, context);

    expect(messages).toEqual([{ type: "nodeSelected", id: "card" }]);
  });

  it.each([
    { label: "width/height", bounds: { x: 10, y: 20, width: 100, height: 50 } },
    { label: "w/h", bounds: { x: 10, y: 20, w: 100, h: 50 } },
  ])("positions the floating bar from $label bounds without NaN", ({ bounds }) => {
    const fab = { classList: createClassList(), style: {} as Record<string, string> };
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const container = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const elements: Record<string, any> = {
      "floating-action-bar": fab,
      "fd-canvas": canvas,
      "canvas-container": container,
    };

    const context = vm.createContext({
      document: {
        getElementById: (id: string) => elements[id] ?? null,
        querySelectorAll: () => [],
      },
      fdCanvas: {
        get_selected_id: () => "card",
        get_node_bounds: () => JSON.stringify(bounds),
        get_selected_node_props: () => JSON.stringify({}),
      },
      pointerIsDown: false,
      inlineEditorActive: false,
      zoomLevel: 1,
      panX: 0,
      panY: 0,
    });

    vm.runInContext(extractFunction(readWebviewSource("context-menu.js"), "updateFloatingBar"), context);
    vm.runInContext("updateFloatingBar()", context);

    expect(fab.style.left).toBe("60px");
    expect(fab.style.left).not.toContain("NaN");
    expect(fab.classList.contains("visible")).toBe(true);
  });

  it("keyboard tool switching clears locked state from floating toolbar buttons", () => {
    const keydownHandlers: Array<(event: any) => void> = [];
    const topButton = createToolButton("rect");
    const floatingButton = createToolButton("rect");
    topButton.classList.add("locked");
    floatingButton.classList.add("locked");

    const context = vm.createContext({
      canvas: { classList: createClassList(), className: "" },
      document: {
        activeElement: null,
        body: { classList: { contains: () => false } },
        addEventListener: (type: string, handler: (event: any) => void) => {
          if (type === "keydown") keydownHandlers.push(handler);
        },
        getElementById: () => null,
        querySelectorAll: (selector: string) => {
          if (selector === ".tool-btn[data-tool]") return [topButton];
          if (selector === ".tool-btn[data-tool], .ft-tool-btn[data-tool]") return [topButton, floatingButton];
          return [];
        },
      },
      window: { addEventListener: () => undefined },
      fdCanvas: {
        handle_key: () => JSON.stringify({ action: "toggleLastTool", changed: false, toolSwitched: true, tool: "ellipse" }),
      },
      lockedTool: "rect",
      lastShortcutKey: null,
      lastShortcutTime: 0,
      DOUBLE_PRESS_MS: 400,
      pointerIsDown: false,
      ctxMenu: { isOpen: false },
      annotationCardNodeId: null,
      shortcutHelpVisible: false,
      Date,
    });

    vm.runInContext(readWebviewSource("shortcuts.js"), context);
    keydownHandlers[0]({
      key: "o",
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: () => undefined,
    });

    expect(topButton.classList.contains("locked")).toBe(false);
    expect(floatingButton.classList.contains("locked")).toBe(false);
  });
});
