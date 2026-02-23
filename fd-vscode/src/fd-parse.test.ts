import { describe, it, expect } from "vitest";
import {
  parseAnnotation,
  parseSpecNodes,
  computeSpecHideLines,
  computeSpecFoldRanges,
  findAnonNodeIds,
  stripMarkdownFences,
  escapeHtml,
  resolveTargetColumn,
  parseDocumentSymbols,
  findSymbolAtLine,
} from "./fd-parse";

// ─── parseAnnotation ─────────────────────────────────────────────────────

describe("parseAnnotation", () => {
  it("parses accept annotation", () => {
    expect(parseAnnotation('## accept: "user can log in"')).toEqual({
      type: "accept",
      value: "user can log in",
    });
  });

  it("parses status annotation", () => {
    expect(parseAnnotation("## status: done")).toEqual({
      type: "status",
      value: "done",
    });
  });

  it("parses priority annotation", () => {
    expect(parseAnnotation("## priority: high")).toEqual({
      type: "priority",
      value: "high",
    });
  });

  it("parses tag annotation", () => {
    expect(parseAnnotation("## tag: conversion, revenue")).toEqual({
      type: "tag",
      value: "conversion, revenue",
    });
  });

  it("parses description annotation", () => {
    expect(parseAnnotation('## "Login form — main CTA"')).toEqual({
      type: "description",
      value: "Login form — main CTA",
    });
  });

  it("returns null for unrecognized annotations", () => {
    expect(parseAnnotation("## some random text")).toBeNull();
  });

  it("returns null for regular comments", () => {
    expect(parseAnnotation("# just a comment")).toBeNull();
  });
});

// ─── parseSpecNodes ──────────────────────────────────────────────────────

describe("parseSpecNodes", () => {
  it("returns empty for empty document", () => {
    const result = parseSpecNodes("");
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("returns empty for comments-only document", () => {
    const result = parseSpecNodes("# comment\n# another comment\n");
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("extracts a typed node without annotations", () => {
    const source = `rect @hero {\n  fill: #FF0000\n}`;
    const result = parseSpecNodes(source);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toEqual({
      id: "hero",
      kind: "rect",
      annotations: [],
    });
  });

  it("extracts a typed node with annotations", () => {
    const source = `rect @card {\n  ## "Main card"\n  ## accept: "visible on load"\n  ## status: done\n  fill: #FFF\n}`;
    const result = parseSpecNodes(source);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("card");
    expect(result.nodes[0].annotations).toHaveLength(3);
    expect(result.nodes[0].annotations[0]).toEqual({
      type: "description",
      value: "Main card",
    });
    expect(result.nodes[0].annotations[1]).toEqual({
      type: "accept",
      value: "visible on load",
    });
    expect(result.nodes[0].annotations[2]).toEqual({
      type: "status",
      value: "done",
    });
  });

  it("extracts a generic node", () => {
    const source = `@login_flow {\n  ## "User login flow"\n  ## priority: high\n}`;
    const result = parseSpecNodes(source);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toEqual({
      id: "login_flow",
      kind: "spec",
      annotations: [
        { type: "description", value: "User login flow" },
        { type: "priority", value: "high" },
      ],
    });
  });

  it("extracts edges", () => {
    const source = `edge @flow1 {\n  from: @login\n  to: @dashboard\n  label: "success"\n}`;
    const result = parseSpecNodes(source);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toEqual({
      from: "login",
      to: "dashboard",
      label: "success",
      annotations: [],
    });
  });

  it("extracts edges with annotations", () => {
    const source = `edge @flow1 {\n  ## "Critical path"\n  from: @a\n  to: @b\n}`;
    const result = parseSpecNodes(source);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].annotations).toEqual([
      { type: "description", value: "Critical path" },
    ]);
  });

  it("handles multiple nodes and edges together", () => {
    const source = [
      "rect @btn {\n  fill: #333\n}",
      "text @label \"Hello\" {\n  ## \"Primary label\"\n}",
      "edge @flow {\n  from: @btn\n  to: @label\n}",
    ].join("\n");
    const result = parseSpecNodes(source);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].id).toBe("btn");
    expect(result.nodes[1].id).toBe("label");
    expect(result.edges).toHaveLength(1);
  });

  it("handles nested groups", () => {
    const source = `group @outer {\n  rect @inner {\n    fill: #FFF\n  }\n}`;
    const result = parseSpecNodes(source);
    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    const ids = result.nodes.map((n) => n.id);
    expect(ids).toContain("inner");
  });

  it("skips incomplete edges (missing from/to)", () => {
    const source = `edge @broken {\n  from: @a\n}`;
    const result = parseSpecNodes(source);
    expect(result.edges).toHaveLength(0);
  });
});

// ─── computeSpecHideLines ────────────────────────────────────────────────

describe("computeSpecHideLines", () => {
  it("returns empty for empty input", () => {
    expect(computeSpecHideLines([])).toEqual([]);
  });

  it("hides style blocks entirely", () => {
    const lines = ["style heading {", "  fill: #333", "  font: Inter 700 32", "}"];
    const hidden = computeSpecHideLines(lines);
    // All 4 lines should be hidden (style block + closing brace of style)
    expect(hidden).toEqual([0, 1, 2, 3]);
  });

  it("hides anim blocks entirely", () => {
    const lines = [
      "rect @btn {",
      "  fill: #333",
      '  anim :hover {',
      '    fill: #555',
      "    scale: 1.02",
      "  }",
      "}",
    ];
    const hidden = computeSpecHideLines(lines);
    // Line 0 (rect @btn {) → kept (node declaration)
    // Line 1 (fill: #333) → hidden (property)
    // Lines 2-5 (anim block) → hidden
    // Line 6 (}) → kept (closing brace)
    expect(hidden).toContain(1); // fill property
    expect(hidden).toContain(2); // anim :hover {
    expect(hidden).toContain(3); // fill: #555
    expect(hidden).toContain(4); // scale: 1.02
    expect(hidden).toContain(5); // }  (inside anim)
    expect(hidden).not.toContain(0); // rect @btn kept
    expect(hidden).not.toContain(6); // } kept
  });

  it("keeps comments and annotations", () => {
    const lines = [
      "# This is a comment",
      '## "Description"',
      '## accept: "criterion"',
      "## status: done",
    ];
    expect(computeSpecHideLines(lines)).toEqual([]);
  });

  it("keeps node and edge declarations", () => {
    const lines = [
      "rect @hero {",
      "group @cards {",
      "text @title \"Hello\" {",
      "@spec_node {",
      "edge @flow1 {",
      "}",
    ];
    expect(computeSpecHideLines(lines)).toEqual([]);
  });

  it("hides property lines inside nodes", () => {
    const lines = [
      "rect @card {",
      "  fill: #FFFFFF",
      "  stroke: #E8E8EC 1",
      "  corner: 16",
      "  w: 300 h: 480",
      "  shadow: (0,2,12,#00000011)",
      "}",
    ];
    const hidden = computeSpecHideLines(lines);
    expect(hidden).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps blank lines", () => {
    const lines = ["rect @a {", "", "  fill: #FFF", "", "}"];
    const hidden = computeSpecHideLines(lines);
    expect(hidden).not.toContain(1); // blank
    expect(hidden).not.toContain(3); // blank
    expect(hidden).toContain(2);     // fill property
  });

  it("keeps edge properties (from/to/label)", () => {
    const lines = [
      "edge @flow {",
      "  from: @login",
      "  to: @dashboard",
      '  label: "success"',
      "}",
    ];
    expect(computeSpecHideLines(lines)).toEqual([]);
  });

  it("hides layout and use lines", () => {
    const lines = [
      "group @cards {",
      "  layout: row gap=24 pad=0",
      "  use: cardStyle",
      "}",
    ];
    const hidden = computeSpecHideLines(lines);
    expect(hidden).toContain(1); // layout
    expect(hidden).toContain(2); // use
  });
});

// ─── computeSpecFoldRanges ──────────────────────────────────────────────

describe("computeSpecFoldRanges", () => {
  it("returns empty for empty input", () => {
    expect(computeSpecFoldRanges([])).toEqual([]);
  });

  it("returns empty when nothing is hidden", () => {
    const lines = ["# comment", "rect @hero {", "}"];
    expect(computeSpecFoldRanges(lines)).toEqual([]);
  });

  it("returns one range for a single contiguous hidden block", () => {
    const lines = ["style heading {", "  fill: #333", "  font: Inter 700 32", "}"];
    const ranges = computeSpecFoldRanges(lines);
    expect(ranges).toEqual([{ start: 0, end: 3 }]);
  });

  it("returns one range for consecutive hidden lines", () => {
    const lines = [
      "rect @btn {",       // 0 - kept
      "  fill: #333",      // 1 - hidden
      '  anim :hover {',   // 2 - hidden
      '    fill: #555',    // 3 - hidden
      "    scale: 1.02",   // 4 - hidden
      "  }",               // 5 - hidden (inside anim closing brace)
      "}",                 // 6 - kept
    ];
    const ranges = computeSpecFoldRanges(lines);
    expect(ranges).toEqual([{ start: 1, end: 5 }]);
  });

  it("returns multiple ranges when hidden blocks are separated by kept lines", () => {
    const lines = [
      "style body {",      // 0 - hidden
      "  fill: #333",      // 1 - hidden
      "}",                 // 2 - hidden
      "",                  // 3 - blank (kept)
      "rect @hero {",      // 4 - kept
      "  w: 100 h: 100",   // 5 - hidden
      "}",                 // 6 - kept
    ];
    const ranges = computeSpecFoldRanges(lines);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ start: 0, end: 2 });
    expect(ranges[1]).toEqual({ start: 5, end: 5 });
  });

  it("handles realistic multi-node structure", () => {
    const lines = [
      "group @nav {",        // 0 - kept
      "  ## \"Navigation\"",  // 1 - kept
      "  layout: row gap=8", // 2 - hidden
      "  rect @btn1 {",      // 3 - kept
      "    w: 50 h: 30",     // 4 - hidden
      "    fill: #FFF",      // 5 - hidden
      "  }",                 // 6 - kept
      "  rect @btn2 {",      // 7 - kept
      "    w: 50 h: 30",     // 8 - hidden
      "  }",                 // 9 - kept
      "}",                   // 10 - kept
    ];
    const ranges = computeSpecFoldRanges(lines);
    expect(ranges).toHaveLength(3);
    expect(ranges[0]).toEqual({ start: 2, end: 2 });
    expect(ranges[1]).toEqual({ start: 4, end: 5 });
    expect(ranges[2]).toEqual({ start: 8, end: 8 });
  });
});

// ─── findAnonNodeIds ─────────────────────────────────────────────────────

describe("findAnonNodeIds", () => {
  it("returns empty for no anon IDs", () => {
    expect(findAnonNodeIds("rect @hero {\n  fill: #FFF\n}")).toEqual([]);
  });

  it("finds a single anon ID", () => {
    const result = findAnonNodeIds('text @_anon_1 "Hello" {\n}');
    expect(result).toEqual(["_anon_1"]);
  });

  it("finds multiple unique anon IDs", () => {
    const source = "rect @_anon_1 {\n}\ntext @_anon_2 {\n}\nellipse @_anon_3 {\n}";
    const result = findAnonNodeIds(source);
    expect(result).toHaveLength(3);
    expect(result).toContain("_anon_1");
    expect(result).toContain("_anon_2");
    expect(result).toContain("_anon_3");
  });

  it("deduplicates repeated IDs", () => {
    const source = "rect @_anon_1 {\n}\n@_anon_1 -> center_in: canvas";
    const result = findAnonNodeIds(source);
    expect(result).toEqual(["_anon_1"]);
  });

  it("ignores non-anon IDs", () => {
    const source = "rect @hero {\n}\ntext @_anon_5 {\n}\ngroup @cards {\n}";
    const result = findAnonNodeIds(source);
    expect(result).toEqual(["_anon_5"]);
  });
});

// ─── stripMarkdownFences ─────────────────────────────────────────────────

describe("stripMarkdownFences", () => {
  it("returns plain text unchanged", () => {
    expect(stripMarkdownFences("rect @hero {\n}")).toBe("rect @hero {\n}");
  });

  it("strips ```fd fences", () => {
    expect(stripMarkdownFences("```fd\nrect @hero {\n}\n```")).toBe(
      "rect @hero {\n}"
    );
  });

  it("strips ```text fences", () => {
    expect(stripMarkdownFences("```text\nhello\n```")).toBe("hello");
  });

  it("strips ```plaintext fences", () => {
    expect(stripMarkdownFences("```plaintext\ncontent\n```")).toBe("content");
  });

  it("strips bare ``` fences", () => {
    expect(stripMarkdownFences("```\ncode\n```")).toBe("code");
  });
});

// ─── escapeHtml ──────────────────────────────────────────────────────────

describe("escapeHtml", () => {
  it("returns clean text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  it("escapes quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  it("escapes all special chars together", () => {
    expect(escapeHtml('<a href="x">&')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;"
    );
  });
});

// ─── resolveTargetColumn ─────────────────────────────────────────────────

describe("resolveTargetColumn", () => {
  it("returns beside when only one group matches active column", () => {
    expect(resolveTargetColumn(1, [1])).toBe("beside");
  });

  it("returns the other column when two groups exist", () => {
    expect(resolveTargetColumn(1, [1, 2])).toBe(2);
  });

  it("returns column 1 when active is column 2", () => {
    expect(resolveTargetColumn(2, [1, 2])).toBe(1);
  });

  it("returns first non-active column with three groups", () => {
    expect(resolveTargetColumn(1, [1, 2, 3])).toBe(2);
  });

  it("returns beside when active column is undefined and single group", () => {
    expect(resolveTargetColumn(undefined, [1])).toBe(1);
  });

  it("returns beside when no groups exist", () => {
    expect(resolveTargetColumn(undefined, [])).toBe("beside");
  });

  it("returns the group column when active column is not in groups", () => {
    expect(resolveTargetColumn(1, [2])).toBe(2);
  });
});

// ─── parseDocumentSymbols ────────────────────────────────────────────────

describe("parseDocumentSymbols", () => {
  it("returns empty for empty input", () => {
    expect(parseDocumentSymbols([])).toEqual([]);
  });

  it("returns empty for comments-only", () => {
    expect(parseDocumentSymbols(["# comment", "# another"])).toEqual([]);
  });

  it("parses a single rect node", () => {
    const lines = ["rect @hero {", "  fill: #FF0000", "}"];
    const result = parseDocumentSymbols(lines);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("@hero");
    expect(result[0].kind).toBe("rect");
    expect(result[0].startLine).toBe(0);
    expect(result[0].endLine).toBe(2);
    expect(result[0].children).toEqual([]);
  });

  it("parses text node with label", () => {
    const lines = ['text @title "Hello World" {', "  font: Inter 700 32", "}"];
    const result = parseDocumentSymbols(lines);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("@title");
    expect(result[0].kind).toBe("text");
    expect(result[0].text).toBe("Hello World");
  });

  it("parses nested group with children", () => {
    const lines = [
      "group @outer {",
      "  rect @inner {",
      "    fill: #FFF",
      "  }",
      "}",
    ];
    const result = parseDocumentSymbols(lines);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("@outer");
    expect(result[0].kind).toBe("group");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].name).toBe("@inner");
    expect(result[0].children[0].kind).toBe("rect");
    expect(result[0].startLine).toBe(0);
    expect(result[0].endLine).toBe(4);
    expect(result[0].children[0].startLine).toBe(1);
    expect(result[0].children[0].endLine).toBe(3);
  });

  it("parses style definition", () => {
    const lines = ["style card_text {", "  font: Inter 14", "  fill: #FFF", "}"];
    const result = parseDocumentSymbols(lines);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("card_text");
    expect(result[0].kind).toBe("style");
    expect(result[0].startLine).toBe(0);
    expect(result[0].endLine).toBe(3);
  });

  it("parses edge block", () => {
    const lines = ["edge @flow1 {", "  from: @login", "  to: @dashboard", "}"];
    const result = parseDocumentSymbols(lines);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("@flow1");
    expect(result[0].kind).toBe("edge");
  });

  it("parses generic node", () => {
    const lines = ["@login_flow {", "  ## \"User login\"", "}"];
    const result = parseDocumentSymbols(lines);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("@login_flow");
    expect(result[0].kind).toBe("spec");
  });

  it("parses constraint line", () => {
    const lines = ["@gallery -> center_in: canvas"];
    const result = parseDocumentSymbols(lines);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("@gallery");
    expect(result[0].kind).toBe("constraint");
    expect(result[0].text).toBe("center_in: canvas");
  });

  it("handles multiple top-level symbols", () => {
    const lines = [
      "style heading {",
      "  fill: #333",
      "}",
      "rect @hero {",
      "  fill: #FFF",
      "}",
      "text @label \"Hi\" {",
      "}",
    ];
    const result = parseDocumentSymbols(lines);
    expect(result).toHaveLength(3);
    expect(result[0].kind).toBe("style");
    expect(result[1].kind).toBe("rect");
    expect(result[2].kind).toBe("text");
  });

  it("handles deeply nested groups", () => {
    const lines = [
      "group @a {",
      "  group @b {",
      "    rect @c {",
      "      fill: #FFF",
      "    }",
      "  }",
      "}",
    ];
    const result = parseDocumentSymbols(lines);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].children).toHaveLength(1);
    expect(result[0].children[0].children[0].name).toBe("@c");
  });
});

// ─── findSymbolAtLine ────────────────────────────────────────────────────

describe("findSymbolAtLine", () => {
  const lines = [
    "group @outer {",     // 0
    "  rect @inner {",    // 1
    "    fill: #FFF",     // 2
    "    w: 100 h: 100",  // 3
    "  }",                // 4
    "  text @label \"Hi\" {", // 5
    "    font: Inter 14", // 6
    "  }",                // 7
    "}",                  // 8
    "",                   // 9
    "@outer -> center_in: canvas", // 10
  ];
  const symbols = parseDocumentSymbols(lines);

  it("returns the node when cursor is on its declaration line", () => {
    const sym = findSymbolAtLine(symbols, 1);
    expect(sym).toBeDefined();
    expect(sym!.name).toBe("@inner");
  });

  it("returns the enclosing node when cursor is on a property line", () => {
    const sym = findSymbolAtLine(symbols, 2);
    expect(sym).toBeDefined();
    expect(sym!.name).toBe("@inner");
  });

  it("returns the enclosing node for another property line", () => {
    const sym = findSymbolAtLine(symbols, 3);
    expect(sym).toBeDefined();
    expect(sym!.name).toBe("@inner");
  });

  it("returns the innermost child, not the parent", () => {
    const sym = findSymbolAtLine(symbols, 6);
    expect(sym).toBeDefined();
    expect(sym!.name).toBe("@label");
  });

  it("returns the parent when cursor is between children", () => {
    // Line 0 is the group declaration itself
    const sym = findSymbolAtLine(symbols, 0);
    expect(sym).toBeDefined();
    expect(sym!.name).toBe("@outer");
  });

  it("returns undefined when cursor is outside all nodes", () => {
    const sym = findSymbolAtLine(symbols, 9);
    expect(sym).toBeUndefined();
  });

  it("returns constraint symbol when cursor is on constraint line", () => {
    const sym = findSymbolAtLine(symbols, 10);
    expect(sym).toBeDefined();
    expect(sym!.name).toBe("@outer");
    expect(sym!.kind).toBe("constraint");
  });

  it("returns undefined for empty symbol list", () => {
    expect(findSymbolAtLine([], 0)).toBeUndefined();
  });

  it("handles style blocks (non-@ symbols)", () => {
    const styleLines = ["style heading {", "  fill: #333", "}"];
    const styleSymbols = parseDocumentSymbols(styleLines);
    const sym = findSymbolAtLine(styleSymbols, 1);
    expect(sym).toBeDefined();
    expect(sym!.name).toBe("heading");
    expect(sym!.kind).toBe("style");
  });
});
