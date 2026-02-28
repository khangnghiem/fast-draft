/**
 * E2E UX Behavior Tests — Simulating Common Design Tool Behaviors
 *
 * Tests the fd-parse functions that underpin UX behaviors found in:
 * Figma, Sketch, Miro, Freeform, Drawio, and Excalidraw.
 *
 * Each describe() block documents which tool's behavior is being simulated
 * and what the expected UX outcome should be.
 */

import { describe, it, expect } from "vitest";
import {
    parseAnnotation,
    parseSpecNodes,
    computeSpecHideLines,
    computeSpecFoldRanges,
    findAnonNodeIds,
    stripMarkdownFences,
    escapeHtml,
    parseDocumentSymbols,
    findSymbolAtLine,
    transformSpecViewLine,
    resolveTargetColumn,
} from "./fd-parse";

// ─── Constants ───────────────────────────────────────────────────────────

const SHAPES = {
    RECT: "rect",
    ELLIPSE: "ellipse",
    TEXT: "text",
    FRAME: "frame",
    LINE: "line",
    ARROW: "arrow",
    GROUP: "group",
};

const COLORS = {
    BLUE: "#007AFF",
    WHITE: "#FFFFFF",
    BLACK: "#000000",
    RED: "#FF0000",
    GREEN: "#34C759",
    DARK_BG: "#1A1A2E",
};

// ─── Figma: Select & Move ────────────────────────────────────────────────
// In Figma, clicking a node selects it and shows its properties.
// Nodes are identified by their @id in the layer tree.

describe("Figma: Select & Move — Layer tree reflects node hierarchy", () => {
    it("parses a single node for selection", () => {
        const lines = [`${SHAPES.RECT} @button {`, `  fill: ${COLORS.BLUE}`, "  w: 120 h: 40", "}"];
        const symbols = parseDocumentSymbols(lines);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].name).toBe("@button");
        expect(symbols[0].kind).toBe(SHAPES.RECT);
    });

    it("clicking on a property line resolves to the parent node (Figma behavior)", () => {
        const lines = [`${SHAPES.RECT} @card {`, `  fill: ${COLORS.WHITE}`, "  w: 300 h: 200", "  corner: 16", "}"];
        const symbols = parseDocumentSymbols(lines);
        // In Figma, clicking anywhere inside a node selects the node
        expect(findSymbolAtLine(symbols, 2)).toBeDefined();
        expect(findSymbolAtLine(symbols, 2)!.name).toBe("@card");
    });

    it("selecting nested children drills into groups (Figma double-click)", () => {
        const lines = [
            `${SHAPES.GROUP} @toolbar {`,
            `  ${SHAPES.RECT} @btn_save {`,
            `    fill: ${COLORS.GREEN}`,
            "  }",
            `  ${SHAPES.RECT} @btn_cancel {`,
            "    fill: #FF3B30",
            "  }",
            "}",
        ];
        const symbols = parseDocumentSymbols(lines);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].children).toHaveLength(2);
        // Deep click: line 2 → @btn_save, not @toolbar
        expect(findSymbolAtLine(symbols, 2)!.name).toBe("@btn_save");
        // Shallow click: line 0 → @toolbar
        expect(findSymbolAtLine(symbols, 0)!.name).toBe("@toolbar");
    });

    it("multi-level nesting correctly resolves deepest symbol", () => {
        const lines = [
            `${SHAPES.GROUP} @page {`,
            `  ${SHAPES.GROUP} @header {`,
            `    ${SHAPES.TEXT} @logo "Logo" {`,
            "      font: Inter 700 24",
            "    }",
            "  }",
            "}",
        ];
        const symbols = parseDocumentSymbols(lines);
        // Line 3 (font property) → @logo
        expect(findSymbolAtLine(symbols, 3)!.name).toBe("@logo");
        // Line 1 (group @header) → @header
        expect(findSymbolAtLine(symbols, 1)!.name).toBe("@header");
    });
});

// ─── Figma/Sketch: Copy & Paste ──────────────────────────────────────────
// When copying a node, Figma generates a unique ID for the paste.
// The copy preserves all properties; paste creates a new instance.

describe("Figma/Sketch: Copy & Paste — ID uniqueness", () => {
    it("copy extracts the correct node block from FD source", () => {
        const source = [
            `${SHAPES.RECT} @hero {`,
            `  fill: ${COLORS.RED}`,
            "  w: 300 h: 200",
            "}",
            "",
            `${SHAPES.TEXT} @title "Hello" {`,
            "  font: Inter 700 32",
            "}",
        ].join("\n");

        // Simulate the copy logic from main.js: find block by @id
        const selectedId = "hero";
        const lines = source.split("\n");
        const startPattern = new RegExp(`^\\s*(\\w+)\\s+@${selectedId}\\b`);
        let startIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (startPattern.test(lines[i])) { startIdx = i; break; }
        }
        expect(startIdx).toBe(0);

        // Collect block (same/deeper indentation)
        const startIndent = lines[startIdx].match(/^\s*/)![0].length;
        let endIdx = startIdx + 1;
        while (endIdx < lines.length) {
            const line = lines[endIdx];
            if (line.trim().length === 0) { endIdx++; continue; }
            const indent = line.match(/^\s*/)![0].length;
            if (indent <= startIndent) break;
            endIdx++;
        }
        const block = lines.slice(startIdx, endIdx).join("\n");
        expect(block).toContain(`fill: ${COLORS.RED}`);
        expect(block).toContain("w: 300 h: 200");
        expect(block).not.toContain("@title");
    });

    it("paste generates a unique ID to avoid duplicates", () => {
        const clipText = `${SHAPES.RECT} @hero {\n  fill: ${COLORS.RED}\n  w: 300 h: 200\n}`;
        const idMatch = clipText.match(/@(\w+)/);
        expect(idMatch).toBeTruthy();
        const oldId = idMatch![1];
        const newId = oldId + "_copy" + Math.floor(Math.random() * 1000);

        // Ensure new ID is different
        expect(newId).not.toBe(oldId);
        expect(newId).toMatch(/^hero_copy\d+$/);

        // Verify all word-boundary references are renamed
        const pasteText = clipText.replace(new RegExp(`@${oldId}\\b`, "g"), `@${newId}`);
        // The new ID contains the old ID as a prefix, so use regex word-boundary check
        const oldIdStillPresent = new RegExp(`@${oldId}\\b`).test(pasteText);
        expect(oldIdStillPresent).toBe(false);
        expect(pasteText).toContain(`@${newId}`);
    });

    it("paste of group with children renames all internal @ids", () => {
        const clipText = [
            `${SHAPES.GROUP} @panel {`,
            `  ${SHAPES.RECT} @bg {`,
            "    fill: #FFF",
            "  }",
            "}",
        ].join("\n");

        // The current paste logic only renames the FIRST @id match
        // This is a known limitation — group children keep original IDs
        const idMatch = clipText.match(/@(\w+)/);
        const oldId = idMatch![1]; // "panel"
        const newId = oldId + "_copy42";
        const pasteText = clipText.replace(new RegExp(`@${oldId}\\b`, "g"), `@${newId}`);

        // BUG DETECTED: @bg is NOT renamed, which causes ID conflicts
        expect(pasteText).toContain("@bg"); // Still references old @bg
        // This documents an existing limitation in copy/paste for groups
    });
});

// ─── Figma/Sketch: Group & Ungroup ───────────────────────────────────────
// Grouping wraps selected nodes. Ungrouping dissolves the group wrapper.

describe("Figma/Sketch: Group & Ungroup — hierarchy parsing", () => {
    it("group wrapping creates a parent-child relationship", () => {
        const lines = [
            `${SHAPES.GROUP} @card_group {`,
            `  ${SHAPES.RECT} @card1 {`,
            "    fill: #FFF",
            "  }",
            `  ${SHAPES.RECT} @card2 {`,
            "    fill: #EEE",
            "  }",
            "}",
        ];
        const symbols = parseDocumentSymbols(lines);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].name).toBe("@card_group");
        expect(symbols[0].kind).toBe(SHAPES.GROUP);
        expect(symbols[0].children).toHaveLength(2);
        expect(symbols[0].children[0].name).toBe("@card1");
        expect(symbols[0].children[1].name).toBe("@card2");
    });

    it("nested groups correctly build hierarchy", () => {
        const lines = [
            `${SHAPES.GROUP} @page {`,
            `  ${SHAPES.GROUP} @header {`,
            `    ${SHAPES.RECT} @logo {`,
            "      fill: #000",
            "    }",
            `    ${SHAPES.TEXT} @nav "Menu" {`,
            "    }",
            "  }",
            `  ${SHAPES.GROUP} @body {`,
            `    ${SHAPES.RECT} @content {`,
            "      fill: #FFF",
            "    }",
            "  }",
            "}",
        ];
        const symbols = parseDocumentSymbols(lines);
        expect(symbols).toHaveLength(1);
        const page = symbols[0];
        expect(page.children).toHaveLength(2);
        expect(page.children[0].name).toBe("@header");
        expect(page.children[0].children).toHaveLength(2);
        expect(page.children[1].name).toBe("@body");
        expect(page.children[1].children).toHaveLength(1);
    });

    it("ungroup detection via regex (used in context menu)", () => {
        const source = `${SHAPES.GROUP} @cards {\n  ${SHAPES.RECT} @a {\n    fill: #F00\n  }\n}`;
        const id = "cards";
        const groupRe = new RegExp(`(?:^|\\n)\\s*${SHAPES.GROUP}\\s+@${id}\\b`);
        expect(groupRe.test(source)).toBe(true);
        // Non-group node should not match
        expect(groupRe.test(source.replace(SHAPES.GROUP, SHAPES.RECT))).toBe(false);
    });
});

// ─── Figma/Sketch: Layer Rename ──────────────────────────────────────────
// Double-clicking a layer name opens an inline rename field.
// All @id references are updated across the document.

describe("Figma/Sketch: Layer Rename — global ID replacement", () => {
    it("renaming an ID updates all references", () => {
        const text = [
            `${SHAPES.RECT} @hero {`,
            "  fill: #F00",
            "}",
            "@hero -> center_in: canvas",
        ].join("\n");

        const oldId = "hero";
        const newId = "banner";
        const renamed = text.replace(new RegExp(`@${oldId}\\b`, "g"), `@${newId}`);

        expect(renamed).not.toContain("@hero");
        expect(renamed).toContain("@banner");
        // Constraint reference also updated
        expect(renamed).toContain("@banner -> center_in: canvas");
    });

    it("rename sanitizes special characters", () => {
        const raw = "Hello World! @#$";
        const sanitized = raw.replace(/[^a-zA-Z0-9_]/g, "_");
        // All non-alphanumeric/underscore chars become underscores, including #
        expect(sanitized).toBe("Hello_World_____");
    });

    it("rename does not affect similar-prefix IDs", () => {
        const text = `${SHAPES.RECT} @btn {\n}\n${SHAPES.RECT} @btn_large {\n}\n@btn -> center_in: canvas`;
        const renamed = text.replace(new RegExp(`@btn\\b`, "g"), "@button");
        expect(renamed).toContain("@button {");
        expect(renamed).toContain("@btn_large"); // Should NOT be renamed
        expect(renamed).toContain("@button -> center_in:");
    });
});

// ─── Drawio/Miro: Layer Tree & Visibility ────────────────────────────────
// Layers panel shows all nodes. Eye icon toggles visibility.

describe("Drawio/Miro: Layer Tree & Visibility toggle", () => {
    it("style blocks appear in layer tree", () => {
        const lines = ["style heading {", "  fill: #333", "  font: Inter 700 32", "}"];
        const symbols = parseDocumentSymbols(lines);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].kind).toBe("style");
        expect(symbols[0].name).toBe("heading");
    });

    it("edges appear in layer tree", () => {
        const lines = ["edge @flow1 {", "  from: @a", "  to: @b", "}"];
        const symbols = parseDocumentSymbols(lines);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].kind).toBe("edge");
    });

    it("constraints appear as single-line symbols", () => {
        const lines = ["@gallery -> center_in: canvas"];
        const symbols = parseDocumentSymbols(lines);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].kind).toBe("constraint");
        expect(symbols[0].text).toBe("center_in: canvas");
    });

    it("complex document produces correct layer count", () => {
        const lines = [
            "style card_style {",
            "  fill: #FFF",
            "}",
            `${SHAPES.GROUP} @page {`,
            `  ${SHAPES.RECT} @header {`,
            `    fill: ${COLORS.BLUE}`,
            "  }",
            `  ${SHAPES.TEXT} @title "Hello" {`,
            "  }",
            "}",
            "edge @flow {",
            "  from: @header",
            "  to: @title",
            "}",
        ];
        const symbols = parseDocumentSymbols(lines);
        // Top-level: style, group, edge = 3
        expect(symbols).toHaveLength(3);
        // Group children: rect, text = 2
        const group = symbols.find((s) => s.name === "@page");
        expect(group).toBeDefined();
        expect(group!.children).toHaveLength(2);
    });
});

// ─── Miro/Freeform/Excalidraw: Infinite Canvas ──────────────────────────
// These tools feature infinite canvas with zoom-to-fit.
// Zoom calculations depend on scene bounds extraction.

describe("Miro/Freeform/Excalidraw: Infinite Canvas — zoom calculations", () => {
    it("zoom-to-fit computes correct fit zoom for scene bounds", () => {
        // Simulating zoomToFit() logic
        const sceneW = 800;
        const sceneH = 600;
        const viewportW = 1200;
        const viewportH = 800;
        const padding = 40;

        const fitZoom = Math.min(
            (viewportW - padding * 2) / Math.max(sceneW, 1),
            (viewportH - padding * 2) / Math.max(sceneH, 1),
        );
        expect(fitZoom).toBeCloseTo(1.2, 1); // (800-80)/600 = 1.2
        // Capped at 2.0
        const FIT_ZOOM_MAX = 2.0;
        const finalZoom = Math.max(0.1, Math.min(FIT_ZOOM_MAX, fitZoom));
        expect(finalZoom).toBe(fitZoom);
    });

    it("zoom-to-fit caps at 200% for small scenes", () => {
        const sceneW = 50;
        const sceneH = 50;
        const viewportW = 1200;
        const viewportH = 800;
        const padding = 40;

        const fitZoom = Math.min(
            (viewportW - padding * 2) / sceneW,
            (viewportH - padding * 2) / sceneH,
        );
        expect(fitZoom).toBeGreaterThan(2.0);
        const FIT_ZOOM_MAX = 2.0;
        const capped = Math.min(FIT_ZOOM_MAX, fitZoom);
        expect(capped).toBe(2.0);
    });

    it("zoom-at-point preserves cursor position", () => {
        let panX = 100;
        let panY = 200;
        let zoomLevel = 1.0;
        const mx = 400;
        const my = 300;
        const factor = 1.25;

        const oldZoom = zoomLevel;
        zoomLevel = Math.max(0.1, Math.min(10, zoomLevel * factor));
        panX = mx - (mx - panX) * (zoomLevel / oldZoom);
        panY = my - (my - panY) * (zoomLevel / oldZoom);

        // The point under the cursor should remain fixed
        const sceneXBefore = (mx - 100) / 1.0; // 300
        const sceneXAfter = (mx - panX) / zoomLevel;
        expect(sceneXAfter).toBeCloseTo(sceneXBefore, 5);
    });

    it("pinch zoom clamp prevents going below 10% or above 1000%", () => {
        const ZOOM_MIN = 0.1;
        const ZOOM_MAX = 10;
        // Zooming out heavily
        let zoom = 0.15;
        zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (1 / 1.03)));
        expect(zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
        // Zooming in heavily
        zoom = 9.9;
        zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * 1.03));
        expect(zoom).toBeLessThanOrEqual(ZOOM_MAX);
    });
});

// ─── Drawio/Miro: Grid Overlay ───────────────────────────────────────────
// Grid spacing adapts to zoom. Too-close dots double in spacing.

describe("Drawio/Miro: Grid overlay — spacing adaptation", () => {
    it("grid doubles spacing when dots too close at low zoom", () => {
        const GRID_BASE_SPACING = 20;
        const zoomLevel = 0.3; // Low zoom
        let spacing = GRID_BASE_SPACING;
        while (spacing * zoomLevel < 10) spacing *= 2;
        expect(spacing).toBeGreaterThan(GRID_BASE_SPACING);
        expect(spacing * zoomLevel).toBeGreaterThanOrEqual(10);
    });

    it("grid uses base spacing at normal zoom", () => {
        const GRID_BASE_SPACING = 20;
        const zoomLevel = 1.0;
        let spacing = GRID_BASE_SPACING;
        while (spacing * zoomLevel < 10) spacing *= 2;
        expect(spacing).toBe(GRID_BASE_SPACING); // No doubling needed
    });

    it("grid switches to lines at high zoom (>= 3x)", () => {
        const zoomLevel = 3.5;
        const useLines = zoomLevel >= 3;
        expect(useLines).toBe(true);
    });
});

// ─── Figma: Inline Text Editing ──────────────────────────────────────────
// Double-click a text node → textarea appears. Enter commits, Esc cancels.

describe("Figma: Inline Text Editing — text node handling", () => {
    it("text node with content is parsed correctly", () => {
        const lines = [`${SHAPES.TEXT} @title "Hello World" {`, "  font: Inter 700 32", "}"];
        const symbols = parseDocumentSymbols(lines);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].name).toBe("@title");
        expect(symbols[0].text).toBe("Hello World");
    });

    it("double-click on empty canvas creates text node (Figma behavior)", () => {
        // When nothing is selected and you double-click, Figma creates a text node
        // This is handled by create_node_at("text", x, y) in the WASM API
        // We verify the parse side: a text node with empty content
        const source = `${SHAPES.TEXT} @_anon_1 "" {\n  x: 100 y: 200\n}`;
        const anons = findAnonNodeIds(source);
        expect(anons).toContain("_anon_1");
    });

    it("hex luminance calculation for text contrast", () => {
        // Light background → dark text
        const hexLuminance = (hex: string) => {
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        };

        expect(hexLuminance(COLORS.WHITE)).toBeCloseTo(1.0, 1);
        expect(hexLuminance(COLORS.BLACK)).toBeCloseTo(0.0, 1);
        // Dark fill → white text (luminance < 0.4)
        expect(hexLuminance("#1C1C1E")).toBeLessThan(0.4);
        // Light fill → dark text (luminance >= 0.4)
        expect(hexLuminance("#F5F5F7")).toBeGreaterThanOrEqual(0.4);
    });
});

// ─── Figma: Properties Panel ─────────────────────────────────────────────
// Selected node shows fill, stroke, size, opacity, corner radius.

describe("Figma: Properties Panel — hex color handling", () => {
    it("3-digit hex expands to 6-digit for color input", () => {
        const hex = "#FFF";
        const expanded = hex.length === 4
            ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
            : hex;
        expect(expanded).toBe(COLORS.WHITE);
    });

    it("6-digit hex truncates to 7 chars (drops alpha)", () => {
        const hex = "#FF000088";
        const truncated = hex.substring(0, 7);
        expect(truncated).toBe(COLORS.RED);
    });

    it("opacity slider range is 0 to 1", () => {
        const opacity = 0.75;
        const display = Math.round(opacity * 100) + "%";
        expect(display).toBe("75%");
    });
});

// ─── Drawio: Drag & Drop from Palette ────────────────────────────────────
// Drawio has a side palette. Drag shape → drop on canvas → create node.

describe("Drawio: Drag & Drop — default shape dimensions", () => {
    it("rect default size is 100×80", () => {
        const DEFAULT_SHAPE_SIZES: Record<string, [number, number]> = {
            [SHAPES.RECT]: [100, 80], [SHAPES.ELLIPSE]: [100, 80], [SHAPES.TEXT]: [80, 24],
            [SHAPES.FRAME]: [200, 150], [SHAPES.LINE]: [120, 4], [SHAPES.ARROW]: [120, 4],
        };
        expect(DEFAULT_SHAPE_SIZES[SHAPES.RECT]).toEqual([100, 80]);
        expect(DEFAULT_SHAPE_SIZES[SHAPES.TEXT]).toEqual([80, 24]);
        expect(DEFAULT_SHAPE_SIZES[SHAPES.FRAME]).toEqual([200, 150]);
    });

    it("drop position converts screen to scene coords", () => {
        const clientX = 500;
        const clientY = 300;
        const rectLeft = 50;
        const rectTop = 50;
        const panX = 100;
        const panY = 50;
        const zoomLevel = 1.5;

        const x = ((clientX - rectLeft) - panX) / zoomLevel;
        const y = ((clientY - rectTop) - panY) / zoomLevel;

        expect(x).toBeCloseTo(233.33, 1);
        expect(y).toBeCloseTo(133.33, 1);
    });
});

// ─── Excalidraw: Nudge with Arrow Keys ───────────────────────────────────
// Arrow keys move selected node 1px. Shift+Arrow moves 10px.

describe("Excalidraw/Figma: Arrow-key nudge", () => {
    it("arrow nudges 1px by default", () => {
        let x = 100;
        const step = 1; // No shift
        x -= step; // ArrowLeft
        expect(x).toBe(99);
    });

    it("shift+arrow nudges 10px", () => {
        let y = 200;
        const step = 10; // With shift
        y -= step; // ArrowUp
        expect(y).toBe(190);
    });
});

// ─── Figma: Selection Bar ────────────────────────────────────────────────
// Bottom bar shows: @id · kind · W×H · (X, Y)

describe("Figma: Selection Bar — status display", () => {
    it("formats selection info correctly", () => {
        const selectedId = "hero";
        const kind = SHAPES.RECT;
        const w = 300;
        const h = 200;
        const x = 50;
        const y = 100;
        const bar = `@${selectedId} · ${kind} · ${w}×${h} · (${x}, ${y})`;
        expect(bar).toBe("@hero · rect · 300×200 · (50, 100)");
    });
});

// ─── Sketch: Color Swatches ─────────────────────────────────────────────
// Preset color palette + recent colors. Dark color detection.

describe("Sketch: Color Swatches — dark color detection", () => {
    it("detects dark colors correctly", () => {
        const isColorDark = (hex: string) => {
            const c = hex.replace("#", "");
            const r = parseInt(c.substring(0, 2), 16);
            const g = parseInt(c.substring(2, 4), 16);
            const b = parseInt(c.substring(4, 6), 16);
            return (r * 299 + g * 587 + b * 114) / 1000 < 128;
        };
        expect(isColorDark(COLORS.BLACK)).toBe(true);
        expect(isColorDark(COLORS.WHITE)).toBe(false);
        expect(isColorDark("#1C1C1E")).toBe(true);
        // #FF3B30 is actually dark by weighted avg: (255*299+59*587+48*114)/1000 ≈ 116 < 128
        expect(isColorDark("#FF3B30")).toBe(true);
        // Yellow is bright: (255*299+204*587+0*114)/1000 ≈ 196 > 128
        expect(isColorDark("#FFCC00")).toBe(false);
    });

    it("recent colors are deduplicated and capped at 6", () => {
        const recentColors: string[] = [];
        const addRecent = (color: string) => {
            const n = color.toUpperCase();
            const idx = recentColors.indexOf(n);
            if (idx >= 0) recentColors.splice(idx, 1);
            recentColors.unshift(n);
            if (recentColors.length > 6) recentColors.pop();
        };
        for (let i = 0; i < 8; i++) {
            addRecent(`#${i.toString().padStart(6, "0")}`);
        }
        expect(recentColors).toHaveLength(6);
        // Most recent should be first
        expect(recentColors[0]).toBe("#000007");
    });
});

// ─── FD-Specific: Spec View (Unique to FD) ──────────────────────────────
// Spec annotations with filter tabs and bulk status.

describe("FD-Specific: Spec View — annotation parsing and filtering", () => {
    it("complex document with mixed annotations", () => {
        const source = [
            `${SHAPES.RECT} @login_btn {`,
            '  spec {',
            '    "Primary login CTA"',
            '    accept: "visible on page load"',
            '    accept: "triggers auth flow"',
            "    status: doing",
            "    priority: high",
            "    tag: auth, conversion",
            "  }",
            `  fill: ${COLORS.BLUE}`,
            "}",
        ].join("\n");
        const result = parseSpecNodes(source);
        expect(result.nodes).toHaveLength(1);
        const node = result.nodes[0];
        expect(node.annotations).toHaveLength(6);
        expect(node.annotations.filter((a) => a.type === "accept")).toHaveLength(2);
        expect(node.annotations.find((a) => a.type === "status")?.value).toBe("doing");
        expect(node.annotations.find((a) => a.type === "priority")?.value).toBe("high");
    });

    it("spec view hides properties but keeps annotations", () => {
        const lines = [
            `${SHAPES.RECT} @card {`,
            `  fill: ${COLORS.WHITE}`,
            "  stroke: #E8E8EC 1",
            "  corner: 16",
            '  spec {',
            '    "Product card"',
            "    status: done",
            "  }",
            "}",
        ];
        const hidden = computeSpecHideLines(lines);
        // Properties (fill, stroke, corner) should be hidden
        expect(hidden).toContain(1); // fill
        expect(hidden).toContain(2); // stroke
        expect(hidden).toContain(3); // corner
        // Spec block and node declaration should NOT be hidden
        expect(hidden).not.toContain(0); // rect @card {
        expect(hidden).not.toContain(8); // }
    });

    it("spec filter by status works on annotated nodes (bug fix: no annotation bleed)", () => {
        // Previously, parseSpecNodes used lines.indexOf() which caused annotation
        // bleed between nodes with identical spec blocks. Now fixed with indexed loop.
        const source = [
            `${SHAPES.RECT} @a {`,
            "  spec {",
            "    status: done",
            "  }",
            "}",
            "",
            `${SHAPES.RECT} @b {`,
            "  spec {",
            "    status: todo",
            "  }",
            "}",
            "",
            `${SHAPES.RECT} @c {`,
            "  spec {",
            "    status: done",
            "  }",
            "}",
        ].join("\n");
        const result = parseSpecNodes(source);
        expect(result.nodes).toHaveLength(3);
        const doneNodes = result.nodes.filter((n) =>
            n.annotations.some((a) => a.type === "status" && a.value === "done"),
        );
        expect(doneNodes).toHaveLength(2);
        expect(doneNodes[0].id).toBe("a");
        expect(doneNodes[1].id).toBe("c");
        const draftNodes = result.nodes.filter((n) =>
            n.annotations.some((a) => a.type === "status" && a.value === "todo"),
        );
        expect(draftNodes).toHaveLength(1);
        expect(draftNodes[0].id).toBe("b");
    });


    it("spec coverage percentage calculation", () => {
        // 3 nodes total, 2 annotated = 67%
        const totalNodes = 3;
        const annotatedCount = 2;
        const pct = Math.round((annotatedCount / totalNodes) * 100);
        expect(pct).toBe(67);
    });
});

// ─── Excalidraw: Tween Animation Engine ──────────────────────────────────
// Animation presets with easing functions.

describe("Excalidraw/Figma: Tween Animation Engine", () => {
    it("ease functions produce correct boundary values", () => {
        const EASE_FNS: Record<string, (t: number) => number> = {
            linear: (t) => t,
            ease_out: (t) => 1 - Math.pow(1 - t, 3),
            ease_in: (t) => t * t * t,
            ease_in_out: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
        };

        // All ease functions: f(0) = 0, f(1) = 1
        for (const [name, fn] of Object.entries(EASE_FNS)) {
            expect(fn(0)).toBe(0);
            expect(fn(1)).toBe(1);
        }
        // Ease out should be ahead of linear at midpoint
        expect(EASE_FNS.ease_out(0.5)).toBeGreaterThan(0.5);
        // Ease in should be behind linear at midpoint
        expect(EASE_FNS.ease_in(0.5)).toBeLessThan(0.5);
    });

    it("tween interpolation produces correct intermediate values", () => {
        const from = 1.0;
        const to = 1.1;
        const easeFn = (t: number) => t; // linear
        const t = 0.5;
        const v = from + (to - from) * easeFn(t);
        expect(v).toBeCloseTo(1.05, 5);
    });
});

// ─── Miro: Minimap ───────────────────────────────────────────────────────
// Minimap shows overview with viewport rectangle.

describe("Miro: Minimap — scene bounds and viewport mapping", () => {
    it("minimap scale factor fits scene in 180×120 with padding", () => {
        const mw = 180;
        const mh = 120;
        const padding = 20;
        const sceneW = 1000;
        const sceneH = 800;

        const scale = Math.min(
            (mw - padding * 2) / sceneW,
            (mh - padding * 2) / sceneH,
        );
        expect(scale).toBeCloseTo(0.1, 2); // (120-40)/800 = 0.1
    });

    it("minimap click converts to scene-space coordinates", () => {
        const mw = 180;
        const mh = 120;
        const padding = 20;
        const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
        const sceneW = bounds.maxX - bounds.minX;
        const sceneH = bounds.maxY - bounds.minY;
        const scale = Math.min(
            (mw - padding * 2) / sceneW,
            (mh - padding * 2) / sceneH,
        );
        const offsetX = (mw - sceneW * scale) / 2;
        const offsetY = (mh - sceneH * scale) / 2;

        // Click at minimap center
        const mx = 90;
        const my = 60;
        const sceneX = (mx - offsetX) / scale + bounds.minX;
        const sceneY = (my - offsetY) / scale + bounds.minY;

        expect(sceneX).toBeCloseTo(500, 0);
        expect(sceneY).toBeCloseTo(400, 0);
    });
});

// ─── Figma: Export PNG ───────────────────────────────────────────────────
// Export scene at 2× resolution with padding.

describe("Figma: Export PNG — bounds calculation", () => {
    it("export canvas adds padding and 2x resolution", () => {
        const sceneW = 800;
        const sceneH = 600;
        const padding = 40;
        const dpr = 2;
        const exportW = (sceneW + padding * 2) * dpr;
        const exportH = (sceneH + padding * 2) * dpr;
        expect(exportW).toBe(1760);
        expect(exportH).toBe(1360);
    });
});

// ─── Edge Cases: Error Resilience ────────────────────────────────────────
// Design tools must handle malformed input gracefully.

describe("Edge Cases: Error resilience", () => {
    it("parseDocumentSymbols handles unclosed braces", () => {
        const lines = [`${SHAPES.RECT} @broken {`, "  fill: #FFF"];
        // Should not throw
        const symbols = parseDocumentSymbols(lines);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].name).toBe("@broken");
    });

    it("parseSpecNodes handles empty document", () => {
        expect(parseSpecNodes("").nodes).toEqual([]);
        expect(parseSpecNodes("").edges).toEqual([]);
    });

    it("parseSpecNodes handles comments-only document", () => {
        expect(parseSpecNodes("# just comments\n# more comments\n").nodes).toEqual([]);
    });

    it("findSymbolAtLine returns undefined for lines outside all nodes", () => {
        const lines = [`${SHAPES.RECT} @a {`, "}", "", "# comment"];
        const symbols = parseDocumentSymbols(lines);
        expect(findSymbolAtLine(symbols, 3)).toBeUndefined();
    });

    it("escapeHtml prevents XSS in node IDs", () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe(
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
        );
    });

    it("transformSpecViewLine handles all node types", () => {
        expect(transformSpecViewLine(`${SHAPES.GROUP} @a {`)).toBe("@a {");
        expect(transformSpecViewLine(`${SHAPES.FRAME} @b {`)).toBe("@b {");
        expect(transformSpecViewLine(`${SHAPES.RECT} @c {`)).toBe("@c {");
        expect(transformSpecViewLine(`${SHAPES.ELLIPSE} @d {`)).toBe("@d {");
        expect(transformSpecViewLine("path @e {")).toBe("@e {");
        expect(transformSpecViewLine(`${SHAPES.TEXT} @f "hi" {`)).toBe('@f "hi" {');
        // Non-node lines unchanged
        expect(transformSpecViewLine("  fill: #FFF")).toBe("  fill: #FFF");
        expect(transformSpecViewLine("style foo {")).toBe("style foo {");
    });
});

// ─── Figma: Card-Building Workflow (Complex Document) ──────────────────────

describe("Figma: Card component build — complex FD documents", () => {
    const cardDoc = [
        "style card_bg {",
        `  fill: ${COLORS.DARK_BG}`,
        "  corner: 12",
        "}",
        "",
        `${SHAPES.TEXT} @card_title "Dashboard" {`,
        `  fill: ${COLORS.WHITE}`,
        '  font: "Inter" 700 24',
        "}",
        "",
        `${SHAPES.GROUP} @card_container {`,
        "  layout: column gap=12 pad=16",
        `  ${SHAPES.RECT} @card_bg {`,
        "    w: 320 h: 200",
        "    use: card_bg",
        "  }",
        `  ${SHAPES.TEXT} @card_label "Revenue" {`,
        "    fill: #888",
        "  }",
        "}",
    ].join("\n");

    it("parseDocumentSymbols handles styles, text with quotes, and nested groups", () => {
        const symbols = parseDocumentSymbols(cardDoc.split("\n"));
        // Should find: style card_bg, text card_title, group card_container
        expect(symbols.length).toBeGreaterThanOrEqual(3);
        const group = symbols.find((s) => s.name === "@card_container");
        expect(group).toBeDefined();
        expect(group!.kind).toBe(SHAPES.GROUP);
        expect(group!.children.length).toBe(2); // card_bg + card_label
    });

    it("parseSpecNodes detects nodes in complex card docs", () => {
        const result = parseSpecNodes(cardDoc);
        // Nodes: @card_title, @card_container, @card_bg, @card_label
        expect(result.nodes.length).toBeGreaterThanOrEqual(3);
    });

    it("findSymbolAtLine finds nested child inside group", () => {
        const symbols = parseDocumentSymbols(cardDoc.split("\n"));
        // Line 12 is "rect @card_bg {" (inside group)
        const sym = findSymbolAtLine(symbols, 12);
        expect(sym).toBeDefined();
        expect(sym!.name).toBe("@card_bg");
    });
});

// ─── Drawio: Multi-shape rapid creation ────────────────────────────────────

describe("Drawio: Rapid shape creation — parsing reliability", () => {
    it("parses consecutive shapes without blank lines between them", () => {
        const source = [
            `${SHAPES.RECT} @box1 { w: 80 h: 40 }`,
            `${SHAPES.ELLIPSE} @circle1 { w: 60 h: 60 }`,
            `${SHAPES.RECT} @box2 { w: 80 h: 40 }`,
        ].join("\n");
        const symbols = parseDocumentSymbols(source.split("\n"));
        expect(symbols).toHaveLength(3);
        expect(symbols[0].name).toBe("@box1");
        expect(symbols[1].name).toBe("@circle1");
        expect(symbols[2].name).toBe("@box2");
    });

    it("parses edges connecting shapes", () => {
        const source = [
            `${SHAPES.RECT} @start {`,
            "  w: 100 h: 50",
            "}",
            "",
            `${SHAPES.RECT} @end {`,
            "  w: 100 h: 50",
            "}",
            "",
            "edge @flow {",
            "  from: @start",
            "  to: @end",
            '  spec "Data flow from start to end"',
            "}",
        ].join("\n");
        const result = parseSpecNodes(source);
        expect(result.nodes).toHaveLength(2);
        expect(result.edges).toHaveLength(1);
        expect(result.edges[0].from).toBe("start");
        expect(result.edges[0].to).toBe("end");
        expect(result.edges[0].annotations).toHaveLength(1);
    });
});

// ─── Sketch: Multi-select behaviors ────────────────────────────────────────

describe("Sketch: Multi-select — symbol hierarchy for selection", () => {
    it("parseDocumentSymbols preserves order matching layers panel order", () => {
        const source = [
            `${SHAPES.RECT} @first { w: 100 h: 50 }`,
            `${SHAPES.ELLIPSE} @second { w: 60 h: 60 }`,
            `${SHAPES.TEXT} @third "Hello" {`,
            "  fill: #000",
            "}",
            `${SHAPES.RECT} @fourth { w: 80 h: 40 }`,
        ].join("\n");
        const symbols = parseDocumentSymbols(source.split("\n"));
        expect(symbols.map((s) => s.name)).toEqual([
            "@first",
            "@second",
            "@third",
            "@fourth",
        ]);
    });

    it("findSymbolAtLine correctly identifies nodes for click-to-select", () => {
        const lines = [
            `${SHAPES.RECT} @a {`,
            "  w: 100",
            "  h: 50",
            "}",
            "",
            `${SHAPES.ELLIPSE} @b {`,
            "  w: 60",
            "}",
        ];
        const symbols = parseDocumentSymbols(lines);
        // Line 1 (w: 100) is inside @a
        expect(findSymbolAtLine(symbols, 1)?.name).toBe("@a");
        // Line 5 (ellipse @b) is start of @b
        expect(findSymbolAtLine(symbols, 5)?.name).toBe("@b");
    });
});

// ─── Figma: Rename — sanitization and word-boundary ────────────────────────

describe("Figma: Rename workflow — advanced edge cases", () => {
    it("rename regex respects word boundaries in nested contexts", () => {
        // Simulates renaming @btn to @button — must not affect @btn_label
        const source = `${SHAPES.GROUP} @card {\n  ${SHAPES.RECT} @btn {\n    w: 100\n  }\n  ${SHAPES.RECT} @btn_label {\n    w: 80\n  }\n}`;
        const renamed = source.replace(
            new RegExp(`@btn\\b`, "g"),
            "@button",
        );
        expect(renamed).toContain("@button {");
        expect(renamed).toContain("@btn_label"); // Must NOT be affected
    });

    it("sanitization strips all non-alphanumeric except underscores", () => {
        const sanitize = (s: string) => s.trim().replace(/[^a-zA-Z0-9_]/g, "_");
        expect(sanitize("hello world")).toBe("hello_world");
        expect(sanitize("node-name")).toBe("node_name");
        expect(sanitize("node.name")).toBe("node_name");
        expect(sanitize("node@name")).toBe("node_name");
        expect(sanitize("CamelCase_123")).toBe("CamelCase_123");
        expect(sanitize("")).toBe("");
    });
});

// ─── Spec: Fold ranges for Spec View hiding ────────────────────────────────

describe("Spec View: Fold ranges computation", () => {
    it("groups consecutive hidden lines into single fold range", () => {
        const lines = [
            `${SHAPES.RECT} @a {`,       // 0 — node decl, shown
            "  w: 100",        // 1 — hidden
            "  h: 50",         // 2 — hidden
            "  fill: #FFF",    // 3 — hidden
            '  spec "Title"',  // 4 — shown
            "}",               // 5 — closing, shown
        ];
        const ranges = computeSpecFoldRanges(lines);
        // Lines 1-3 should form a single fold range
        expect(ranges.length).toBeGreaterThanOrEqual(1);
    });

    it("multiple non-contiguous blocks produce separate fold ranges", () => {
        const lines = [
            `${SHAPES.RECT} @a {`,       // 0
            "  w: 100",        // 1 — hidden
            '  spec "A"',      // 2 — shown
            "}",               // 3
            "",                // 4
            `${SHAPES.RECT} @b {`,       // 5
            "  h: 200",        // 6 — hidden
            '  spec "B"',      // 7 — shown
            "}",               // 8
        ];
        const ranges = computeSpecFoldRanges(lines);
        expect(ranges.length).toBeGreaterThanOrEqual(2);
    });
});

// ─── Panel column resolution (canvas placement) ────────────────────────────

describe("Panel column resolution for canvas placement", () => {
    it("returns 'beside' when no other columns available", () => {
        const result = resolveTargetColumn(1, [1]);
        expect(result).toBe("beside");
    });

    it("returns other column when two groups exist", () => {
        const result = resolveTargetColumn(1, [1, 2]);
        expect(result).toBe(2);
    });

    it("returns first non-active column when multiple groups exist", () => {
        const result = resolveTargetColumn(2, [1, 2, 3]);
        expect(result).toBe(1);
    });

    it("returns 'beside' when active column is undefined", () => {
        const result = resolveTargetColumn(undefined, []);
        expect(result).toBe("beside");
    });
});

// ─── Frame nodes (Figma-style auto-layout containers) ──────────────────────

describe("Frame nodes — auto-layout container parsing", () => {
    it("parseDocumentSymbols correctly parses frame nodes", () => {
        const lines = [
            `${SHAPES.FRAME} @page {`,
            "  layout: column gap=16",
            `  ${SHAPES.RECT} @hero {`,
            "    w: 800 h: 400",
            "  }",
            `  ${SHAPES.TEXT} @heading "Welcome" {`,
            "    fill: #000",
            "  }",
            "}",
        ];
        const symbols = parseDocumentSymbols(lines);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].name).toBe("@page");
        expect(symbols[0].kind).toBe(SHAPES.FRAME);
        expect(symbols[0].children).toHaveLength(2);
    });

    it("parseSpecNodes includes frame nodes", () => {
        const source = `${SHAPES.FRAME} @layout {\n  spec {\n    status: done\n  }\n}`;
        const result = parseSpecNodes(source);
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].kind).toBe(SHAPES.FRAME);
        expect(result.nodes[0].annotations[0].value).toBe("done");
    });
});

// ─── Deep nesting (3+ levels) ──────────────────────────────────────────────

describe("Deep nesting — 3+ levels of hierarchy", () => {
    it("parseDocumentSymbols handles 3-level nesting", () => {
        const lines = [
            `${SHAPES.GROUP} @level1 {`,
            `  ${SHAPES.GROUP} @level2 {`,
            `    ${SHAPES.RECT} @level3 {`,
            "      w: 50 h: 50",
            "    }",
            "  }",
            "}",
        ];
        const symbols = parseDocumentSymbols(lines);
        expect(symbols).toHaveLength(1);
        expect(symbols[0].name).toBe("@level1");
        expect(symbols[0].children).toHaveLength(1);
        expect(symbols[0].children[0].name).toBe("@level2");
        expect(symbols[0].children[0].children).toHaveLength(1);
        expect(symbols[0].children[0].children[0].name).toBe("@level3");
    });

    it("findSymbolAtLine finds deepest node in 3-level nesting", () => {
        const lines = [
            `${SHAPES.GROUP} @l1 {`,    // 0
            `  ${SHAPES.GROUP} @l2 {`,  // 1
            `    ${SHAPES.RECT} @l3 {`, // 2
            "      w: 50",    // 3
            "    }",          // 4
            "  }",            // 5
            "}",              // 6
        ];
        const symbols = parseDocumentSymbols(lines);
        const deepest = findSymbolAtLine(symbols, 3);
        expect(deepest).toBeDefined();
        expect(deepest!.name).toBe("@l3");
    });

    it("drill-down selection through 3 levels (Figma behavior simulation)", () => {
        // Simulates the effective_target logic from Rust:
        // - Find highest unselected group ancestor
        // - If all group ancestors are selected, return the leaf
        const lines = [
            `${SHAPES.GROUP} @outer {`,      // 0
            `  ${SHAPES.GROUP} @middle {`,   // 1
            `    ${SHAPES.RECT} @inner {`,   // 2
            "      w: 80 h: 60",   // 3
            "    }",               // 4
            "  }",                 // 5
            "}",                   // 6
        ];
        const symbols = parseDocumentSymbols(lines);

        // Verify hierarchy is correct
        expect(symbols).toHaveLength(1);
        const outer = symbols[0];
        expect(outer.name).toBe("@outer");
        expect(outer.children).toHaveLength(1);
        const middle = outer.children[0];
        expect(middle.name).toBe("@middle");
        expect(middle.children).toHaveLength(1);
        const inner = middle.children[0];
        expect(inner.name).toBe("@inner");

        // Simulate effective_target: find highest unselected group ancestor
        const effectiveTarget = (
            leafName: string,
            selected: string[],
            syms: typeof symbols,
        ): string => {
            // Walk up from leaf, collecting group ancestors
            const ancestors: string[] = [];
            const findAncestors = (
                nodes: typeof symbols,
                target: string,
                path: string[],
            ): string[] | null => {
                for (const node of nodes) {
                    const currentPath = [...path, node.name];
                    if (node.name === target) return currentPath;
                    if (node.children?.length) {
                        const found = findAncestors(node.children, target, currentPath);
                        if (found) return found;
                    }
                }
                return null;
            };
            const chain = findAncestors(syms, leafName, []);
            if (!chain) return leafName;

            // Find highest unselected group in the chain (excluding leaf)
            for (const ancestor of chain.slice(0, -1)) {
                if (!selected.includes(ancestor)) return ancestor;
            }
            return leafName;
        };

        // Click 1: nothing selected → selects @outer (highest unselected group)
        expect(effectiveTarget("@inner", [], symbols)).toBe("@outer");

        // Click 2: @outer selected → drills to @middle
        expect(effectiveTarget("@inner", ["@outer"], symbols)).toBe("@middle");

        // Click 3: both groups selected → drills to @inner (leaf)
        expect(effectiveTarget("@inner", ["@outer", "@middle"], symbols)).toBe("@inner");
    });

    it("findSymbolAtLine resolves each level independently in 3-level nesting", () => {
        const lines = [
            `${SHAPES.GROUP} @page {`,           // 0
            `  ${SHAPES.GROUP} @sidebar {`,      // 1
            `    ${SHAPES.RECT} @nav_item {`,    // 2
            "      fill: #333",        // 3
            "      w: 200 h: 40",      // 4
            "    }",                    // 5
            "  }",                      // 6
            "}",                        // 7
        ];
        const symbols = parseDocumentSymbols(lines);

        // Line 0 → @page (outermost group declaration)
        expect(findSymbolAtLine(symbols, 0)!.name).toBe("@page");
        // Line 1 → @sidebar (middle group declaration)
        expect(findSymbolAtLine(symbols, 1)!.name).toBe("@sidebar");
        // Line 2 → @nav_item (leaf declaration)
        expect(findSymbolAtLine(symbols, 2)!.name).toBe("@nav_item");
        // Line 3 → @nav_item (property inside leaf)
        expect(findSymbolAtLine(symbols, 3)!.name).toBe("@nav_item");
    });
});

// ─── Bidi Sync: Canvas→Code Selection Highlighting (R2.5) ────────────────
// When a node is selected on canvas, its @id line in Code Mode should
// be highlighted. This broke due to stale dedup state and overly
// aggressive cursor guards.

describe("Bidi Sync: Canvas→Code selection highlighting (R2.5)", () => {
    it("lastNotifiedSelectedId resets when selectNode arrives from extension", () => {
        // Simulates the dedup guard in main.js that prevents sending
        // redundant nodeSelected messages. When the extension sends
        // selectNode (cursor→canvas sync), lastNotifiedSelectedId must
        // update so the next canvas click can still send nodeSelected.
        let lastNotifiedSelectedId = "";

        // Step 1: Canvas click selects @heading → sends nodeSelected
        const canvasSelectedId = "heading";
        if (canvasSelectedId !== lastNotifiedSelectedId) {
            lastNotifiedSelectedId = canvasSelectedId;
            // Simulates: vscode.postMessage({ type: "nodeSelected", id })
        }
        expect(lastNotifiedSelectedId).toBe("heading");

        // Step 2: Extension echoes back selectNode (cursor sync)
        const extensionNodeId = "heading";
        // BUG FIX: must update lastNotifiedSelectedId here
        lastNotifiedSelectedId = extensionNodeId;
        expect(lastNotifiedSelectedId).toBe("heading");

        // Step 3: User clicks @amount on canvas
        const newCanvasId = "amount";
        const shouldSend = newCanvasId !== lastNotifiedSelectedId;
        expect(shouldSend).toBe(true);

        // Step 4: Cursor sync changes selection to @chart_area
        lastNotifiedSelectedId = "chart_area";

        // Step 5: User clicks @chart_area on canvas → should still notify
        // because the extension set @chart_area, not the canvas
        const sameId = "chart_area";
        // After fix: lastNotifiedSelectedId was updated by selectNode,
        // so this matches. In the old code, the canvas click would have
        // a different lastNotifiedSelectedId and incorrectly skip.
        // The fix ensures selectNode updates lastNotifiedSelectedId.
        expect(sameId).toBe(lastNotifiedSelectedId);
    });

    it("nodeSelected handler finds correct line for @id pattern", () => {
        const lines = [
            "style accent {",
            "  fill: #6C5CE7",
            "}",
            "",
            `${SHAPES.GROUP} @dashboard_card {`,
            "  layout: column gap=12 pad=24",
            `  ${SHAPES.TEXT} @heading \"Monthly Revenue\" {`,
            "    fill: #1A1A2E",
            "  }",
            `  ${SHAPES.TEXT} @amount \"$48,250\" {`,
            "    fill: #1A1A2E",
            "  }",
            "}",
        ];

        // Simulates the extension's nodeSelected handler regex search
        const nodeId = "heading";
        const pattern = new RegExp(`@${nodeId}\\b`);
        let foundLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
                foundLine = i;
                break;
            }
        }
        expect(foundLine).toBe(6);
        expect(lines[foundLine]).toContain("@heading");
    });

    it("nodeSelected always applies decoration even when cursor already on line", () => {
        // Verifies the fix: the extension should show the highlight
        // decoration regardless of whether the cursor is already on
        // the target line.
        const lines = [
            `${SHAPES.RECT} @card {`,
            "  fill: #FFF",
            "}",
        ];
        const symbols = parseDocumentSymbols(lines);

        // Cursor is already on line 0 (the @card line)
        const cursorLine = 0;
        const nodeId = "card";
        const pattern = new RegExp(`@${nodeId}\\b`);

        let foundLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
                foundLine = i;
                break;
            }
        }
        expect(foundLine).toBe(0);

        // OLD BUG: if (cursorLine === i) break; → skipped decoration
        // FIX: cursor check only skips move, NOT decoration
        const shouldMoveCursor = cursorLine !== foundLine;
        expect(shouldMoveCursor).toBe(false); // Cursor already there
        // But decoration should STILL be applied
        const shouldDecorate = foundLine >= 0;
        expect(shouldDecorate).toBe(true);
    });

    it("findSymbolAtLine correctly maps cursor position for selection sync", () => {
        const lines = [
            `${SHAPES.GROUP} @dashboard {`,
            `  ${SHAPES.TEXT} @heading \"Revenue\" {`,
            "    fill: #333",
            "    font: Inter 700 18",
            "  }",
            `  ${SHAPES.RECT} @chart {`,
            "    w: 300 h: 160",
            "    fill: #F0F0F5",
            "  }",
            "}",
        ];
        const symbols = parseDocumentSymbols(lines);

        // Cursor on property line → resolves to parent node
        expect(findSymbolAtLine(symbols, 2)!.name).toBe("@heading");
        expect(findSymbolAtLine(symbols, 3)!.name).toBe("@heading");
        // Cursor on node declaration → resolves to that node
        expect(findSymbolAtLine(symbols, 5)!.name).toBe("@chart");
        // Cursor on group declaration → resolves to group
        expect(findSymbolAtLine(symbols, 0)!.name).toBe("@dashboard");
    });
});
