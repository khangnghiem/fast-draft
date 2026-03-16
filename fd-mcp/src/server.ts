#!/usr/bin/env node

/**
 * MCP Server for Fast Draft (.fd) files.
 *
 * Exposes FD document operations as MCP tools so that any
 * MCP-compatible AI agent (Claude, Cursor, Copilot, Windsurf)
 * can natively read, modify, and reason about .fd designs.
 *
 * Transport: stdio (launched by VS Code or CLI)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── FD Parsing Utilities ─────────────────────────────────────────────

/** Regex for typed FD nodes: rect @id "label" { */
const NODE_TYPED_RE =
  /^(\s*)(group|frame|rect|ellipse|path|text)\s+@(\w+)(?:\s+"([^"]*)")?\s*\{?/;
/** Regex for any @id reference */
const ID_RE = /@(\w+)/g;

interface FdNode {
  kind: string;
  id: string;
  label?: string;
  line: number;
  endLine: number;
  props: Record<string, string>;
  children: FdNode[];
  raw: string;
}

/** Parse an FD document into a flat list of top-level node blocks. */
function parseFdNodes(source: string): FdNode[] {
  const lines = source.split("\n");
  const nodes: FdNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = lines[i].match(NODE_TYPED_RE);
    if (match) {
      const startLine = i;
      const indent = match[1];
      const kind = match[2];
      const id = match[3];
      const label = match[4] || undefined;
      const props: Record<string, string> = {};
      const rawLines = [lines[i]];
      let depth = lines[i].includes("{") ? 1 : 0;

      if (depth > 0) {
        i++;
        while (i < lines.length && depth > 0) {
          rawLines.push(lines[i]);
          const trimmed = lines[i].trim();
          depth += (trimmed.match(/\{/g) || []).length;
          depth -= (trimmed.match(/\}/g) || []).length;

          // Extract simple key: value properties
          const propMatch = trimmed.match(
            /^(\w[\w-]*):\s*(.+?)$/
          );
          if (propMatch && depth >= 1) {
            props[propMatch[1]] = propMatch[2];
          }
          if (depth <= 0) break;
          i++;
        }
      }

      nodes.push({
        kind,
        id,
        label,
        line: startLine,
        endLine: i,
        props,
        children: [],
        raw: rawLines.join("\n"),
      });
    }
    i++;
  }
  return nodes;
}

/** Find the line range of a node block by @id. */
function findNodeRange(
  source: string,
  nodeId: string
): { start: number; end: number } | null {
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(NODE_TYPED_RE);
    if (match && match[3] === nodeId) {
      let depth = lines[i].includes("{") ? 1 : 0;
      if (depth === 0) return { start: i, end: i };
      let j = i + 1;
      while (j < lines.length && depth > 0) {
        const trimmed = lines[j].trim();
        depth += (trimmed.match(/\{/g) || []).length;
        depth -= (trimmed.match(/\}/g) || []).length;
        if (depth <= 0) return { start: i, end: j };
        j++;
      }
      return { start: i, end: j - 1 };
    }
  }
  return null;
}

/** Collect all @id references in an FD document. */
function findAllIds(source: string): string[] {
  const ids = new Set<string>();
  for (const m of source.matchAll(ID_RE)) {
    ids.add(m[1]);
  }
  return [...ids];
}

/** Compute a simple AI comprehensibility score (0-100). */
function computeScore(source: string): {
  score: number;
  breakdown: Record<string, number>;
} {
  const nodes = parseFdNodes(source);
  const ids = findAllIds(source);
  const anonPattern = /^_?\w+_\d+$/;
  const anonCount = ids.filter((id) => anonPattern.test(id)).length;
  const semanticCount = ids.length - anonCount;

  const hasConstraints = /\b(center_in|place|align|stack)\b/.test(source);
  const hasStyles = /\bstyle\s+\w+\s*\{/.test(source);
  const hasSpecs = /\bspec\s/.test(source);
  const hasComments = /^\s*#/m.test(source);

  const breakdown: Record<string, number> = {
    semantic_names: ids.length > 0
      ? Math.round((semanticCount / ids.length) * 40)
      : 40,
    constraints: hasConstraints ? 15 : 0,
    style_reuse: hasStyles ? 15 : 0,
    specs: hasSpecs ? 15 : 0,
    comments: hasComments ? 5 : 0,
    node_count: Math.min(nodes.length * 2, 10),
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score: Math.min(score, 100), breakdown };
}

/** Read an .fd file, throwing a descriptive error if not found. */
function readFdFile(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  if (!resolved.endsWith(".fd")) {
    throw new Error(`Not an .fd file: ${resolved}`);
  }
  return fs.readFileSync(resolved, "utf-8");
}

/** Write an .fd file atomically. */
function writeFdFile(filePath: string, content: string): void {
  const resolved = path.resolve(filePath);
  fs.writeFileSync(resolved, content, "utf-8");
}

// ─── MCP Server ───────────────────────────────────────────────────────

const server = new McpServer({
  name: "fd-mcp",
  version: "0.1.0",
});

// ── Tool: fd_read_document ──────────────────────────────────────────

server.tool(
  "fd_read_document",
  "Read and return the contents of an .fd (Fast Draft) file",
  { path: z.string().describe("Absolute or relative path to the .fd file") },
  async ({ path: filePath }) => {
    try {
      const content = readFdFile(filePath);
      return {
        content: [{ type: "text" as const, text: content }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: fd_list_nodes ─────────────────────────────────────────────

server.tool(
  "fd_list_nodes",
  "Parse an .fd file and return a JSON tree of all nodes with their types, IDs, labels, and properties",
  { path: z.string().describe("Path to the .fd file") },
  async ({ path: filePath }) => {
    try {
      const content = readFdFile(filePath);
      const nodes = parseFdNodes(content);
      const summary = nodes.map((n) => ({
        kind: n.kind,
        id: n.id,
        label: n.label,
        props: n.props,
        line: n.line + 1,
      }));
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(summary, null, 2) },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: fd_create_node ────────────────────────────────────────────

server.tool(
  "fd_create_node",
  "Append a new node block to an .fd file. Supports rect, ellipse, text, group, frame, path.",
  {
    path: z.string().describe("Path to the .fd file"),
    type: z
      .enum(["rect", "ellipse", "text", "group", "frame", "path"])
      .describe("Node type"),
    id: z.string().describe("Node ID (snake_case, e.g. 'hero_card')"),
    label: z.string().optional().describe("Optional label text (for text nodes)"),
    props: z
      .record(z.string(), z.string())
      .optional()
      .describe("Optional properties as key-value pairs, e.g. { w: '100', h: '50', fill: '#FF6B6B' }"),
  },
  async ({ path: filePath, type, id, label, props }) => {
    try {
      const content = readFdFile(filePath);

      // Check for ID collision
      const existingIds = findAllIds(content);
      if (existingIds.includes(id)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Node @${id} already exists. Choose a different ID.`,
            },
          ],
          isError: true,
        };
      }

      // Build the node block
      const labelPart = label ? ` "${label}"` : "";
      let block = `\n${type} @${id}${labelPart} {\n`;
      if (props) {
        for (const [key, value] of Object.entries(props)) {
          block += `  ${key}: ${value}\n`;
        }
      }
      block += "}\n";

      writeFdFile(filePath, content.trimEnd() + "\n" + block);
      return {
        content: [
          {
            type: "text" as const,
            text: `Created ${type} @${id}. New block:\n${block.trim()}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: fd_update_node ────────────────────────────────────────────

server.tool(
  "fd_update_node",
  "Update properties of an existing node in an .fd file. Merges new properties with existing ones.",
  {
    path: z.string().describe("Path to the .fd file"),
    id: z.string().describe("Node ID to update (without @)"),
    props: z
      .record(z.string(), z.string())
      .describe("Properties to set/update as key-value pairs"),
  },
  async ({ path: filePath, id, props }) => {
    try {
      const content = readFdFile(filePath);
      const range = findNodeRange(content, id);
      if (!range) {
        return {
          content: [
            { type: "text" as const, text: `Error: Node @${id} not found.` },
          ],
          isError: true,
        };
      }

      const lines = content.split("\n");

      // Update existing or add new properties within the block
      const blockLines = lines.slice(range.start, range.end + 1);
      const updatedProps = new Set<string>();

      for (let i = 1; i < blockLines.length - 1; i++) {
        const propMatch = blockLines[i].match(/^(\s*)(\w[\w-]*):\s*(.+?)$/);
        if (propMatch && props[propMatch[2]] !== undefined) {
          blockLines[i] = `${propMatch[1]}${propMatch[2]}: ${props[propMatch[2]]}`;
          updatedProps.add(propMatch[2]);
        }
      }

      // Add any new props that weren't already in the block
      const closingIdx = blockLines.length - 1;
      const newProps: string[] = [];
      for (const [key, value] of Object.entries(props)) {
        if (!updatedProps.has(key)) {
          newProps.push(`  ${key}: ${value}`);
        }
      }
      if (newProps.length > 0) {
        blockLines.splice(closingIdx, 0, ...newProps);
      }

      // Rebuild the file
      lines.splice(range.start, range.end - range.start + 1, ...blockLines);
      writeFdFile(filePath, lines.join("\n"));

      return {
        content: [
          {
            type: "text" as const,
            text: `Updated @${id}: ${Object.keys(props).join(", ")}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: fd_delete_node ────────────────────────────────────────────

server.tool(
  "fd_delete_node",
  "Remove a node block from an .fd file by its @id",
  {
    path: z.string().describe("Path to the .fd file"),
    id: z.string().describe("Node ID to delete (without @)"),
  },
  async ({ path: filePath, id }) => {
    try {
      const content = readFdFile(filePath);
      const range = findNodeRange(content, id);
      if (!range) {
        return {
          content: [
            { type: "text" as const, text: `Error: Node @${id} not found.` },
          ],
          isError: true,
        };
      }

      const lines = content.split("\n");
      lines.splice(range.start, range.end - range.start + 1);

      // Clean up extra blank lines
      const cleaned = lines.join("\n").replace(/\n{3,}/g, "\n\n");
      writeFdFile(filePath, cleaned);

      return {
        content: [
          { type: "text" as const, text: `Deleted @${id} (lines ${range.start + 1}-${range.end + 1}).` },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: fd_rename_node ────────────────────────────────────────────

server.tool(
  "fd_rename_node",
  "Rename a node @id across the entire .fd document (all references updated)",
  {
    path: z.string().describe("Path to the .fd file"),
    old_id: z.string().describe("Current node ID (without @)"),
    new_id: z.string().describe("New node ID (without @, snake_case)"),
  },
  async ({ path: filePath, old_id, new_id }) => {
    try {
      let content = readFdFile(filePath);

      // Validate new_id format
      if (!/^[a-z][a-z0-9_]*$/.test(new_id)) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: new_id must be snake_case (lowercase letters, numbers, underscores, starting with a letter).",
            },
          ],
          isError: true,
        };
      }

      // Check that old_id exists
      if (!findAllIds(content).includes(old_id)) {
        return {
          content: [
            { type: "text" as const, text: `Error: @${old_id} not found in document.` },
          ],
          isError: true,
        };
      }

      // Check collision
      if (findAllIds(content).includes(new_id)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: @${new_id} already exists. Choose a different name.`,
            },
          ],
          isError: true,
        };
      }

      // Replace all occurrences: @old_id → @new_id
      const regex = new RegExp(`@${old_id}\\b`, "g");
      const count = (content.match(regex) || []).length;
      content = content.replace(regex, `@${new_id}`);

      writeFdFile(filePath, content);
      return {
        content: [
          {
            type: "text" as const,
            text: `Renamed @${old_id} → @${new_id} (${count} references updated).`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: fd_get_score ──────────────────────────────────────────────

server.tool(
  "fd_get_score",
  "Calculate an AI comprehensibility score (0-100) for an .fd file. Higher = more AI-friendly.",
  { path: z.string().describe("Path to the .fd file") },
  async ({ path: filePath }) => {
    try {
      const content = readFdFile(filePath);
      const { score, breakdown } = computeScore(content);
      const report = [
        `AI Comprehensibility Score: ${score}/100`,
        "",
        "Breakdown:",
        ...Object.entries(breakdown).map(
          ([key, val]) => `  ${key}: ${val}`
        ),
        "",
        score < 50
          ? "Tip: Rename auto-generated IDs (like @_rect_0) to semantic names (like @hero_card)."
          : score < 80
            ? "Good! Consider adding constraints and style blocks for higher scores."
            : "Excellent! This document is highly AI-comprehensible.",
      ];
      return {
        content: [{ type: "text" as const, text: report.join("\n") }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── Resource: fd://active-document ──────────────────────────────────

// Note: This resource works best when the server is launched by VS Code,
// which can provide the active document path via environment variables.
// For standalone usage, it lists .fd files in the current directory.

server.resource(
  "active-document",
  "fd://active-document",
  {
    description:
      "The .fd text of the active document. Falls back to listing .fd files in the working directory.",
    mimeType: "text/plain",
  },
  async (_uri, _extra) => {
    // Check if VS Code passed the active file path
    const activePath = process.env.FD_ACTIVE_DOCUMENT;
    if (activePath && fs.existsSync(activePath)) {
      const content = fs.readFileSync(activePath, "utf-8");
      return {
        contents: [{ uri: "fd://active-document", text: content, mimeType: "text/plain" }],
      };
    }

    // Fallback: list .fd files in cwd
    const cwd = process.cwd();
    const fdFiles = findFdFiles(cwd);
    if (fdFiles.length === 0) {
      return {
        contents: [
          {
            uri: "fd://active-document",
            text: "No .fd files found in current directory. Use fd_read_document tool with an explicit path.",
            mimeType: "text/plain",
          },
        ],
      };
    }

    // Return first .fd file found
    const first = fdFiles[0];
    const content = fs.readFileSync(first, "utf-8");
    return {
      contents: [{ uri: "fd://active-document", text: content, mimeType: "text/plain" }],
    };
  }
);

/** Recursively find .fd files in a directory (max 2 levels deep). */
function findFdFiles(dir: string, depth = 0): string[] {
  if (depth > 2) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "target") continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith(".fd")) {
        results.push(full);
      } else if (entry.isDirectory()) {
        results.push(...findFdFiles(full, depth + 1));
      }
    }
  } catch {
    // Permission errors, etc.
  }
  return results;
}

// ── Start Server ────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("fd-mcp server failed to start:", err);
  process.exit(1);
});
