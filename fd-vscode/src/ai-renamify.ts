/**
 * AI Renamify — batch rename anonymous node IDs to semantic names.
 *
 * Uses the same AI provider infrastructure as ai-refine.ts but sends a
 * focused rename-only prompt that returns a JSON map instead of a full
 * document rewrite. Much faster and more reliable.
 */

import { getAiConfig } from "./ai-refine";
import {
    findAnonymousNodeIds,
    findAllNodeIds,
    sanitizeToFdId,
    stripMarkdownFences,
} from "./fd-parse";

// ─── Types ───────────────────────────────────────────────────────────────

export interface RenameProposal {
    oldId: string;
    newId: string;
}

export interface RenamifyResult {
    proposals: RenameProposal[];
    error?: string;
    needsSettings?: boolean;
}

// ─── Prompt ──────────────────────────────────────────────────────────────

export function buildRenamifyPrompt(fdText: string, anonIds: string[]): string {
    const idList = anonIds.map((id) => `@${id}`).join(", ");
    return `You are an expert UI designer working with the FD (Fast Draft) format.

The following .fd document contains anonymous node IDs that need semantic names:
${idList}

## Rules

1. Return ONLY a JSON object mapping old IDs to new IDs.
2. New names must be short, descriptive snake_case (e.g., "hero_card", "nav_btn", "login_form").
3. Max 20 characters per name.
4. Names must describe the node's visual purpose based on its properties and context.
5. Do NOT use generic names like "node_1" or "item_a" — be specific.
6. Every anonymous ID listed above MUST appear as a key in the output.
7. Output ONLY valid JSON — no markdown fences, no explanation, no comments.

## Example Output

{"rect_1": "sidebar_bg", "text_3": "page_title", "ellipse_2": "avatar_icon"}

## FD Document

${fdText}`;
}

// ─── Response Parsing ────────────────────────────────────────────────────

/**
 * Parse the AI response into validated rename proposals.
 * Handles edge cases: duplicates, conflicts, invalid identifiers.
 */
export function parseRenamifyResponse(
    raw: string,
    anonIds: string[],
    existingIds: string[]
): RenameProposal[] {
    let cleaned = stripMarkdownFences(raw).trim();
    // Sometimes AI wraps JSON in backticks
    cleaned = cleaned.replace(/^```json?\s*\n?/, "").replace(/\n?```\s*$/, "");

    let parsed: Record<string, string>;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        return [];
    }

    if (typeof parsed !== "object" || parsed === null) return [];

    const usedNames = new Set(existingIds);
    const proposals: RenameProposal[] = [];

    for (const oldId of anonIds) {
        const rawName = parsed[oldId];
        if (!rawName || typeof rawName !== "string") continue;

        let newId = sanitizeToFdId(rawName);
        if (!newId || newId === oldId) continue;

        // Resolve conflicts: suffix with _2, _3, etc.
        let candidate = newId;
        let suffix = 2;
        while (usedNames.has(candidate)) {
            candidate = `${newId}_${suffix}`;
            suffix++;
        }
        newId = candidate;

        usedNames.add(newId);
        proposals.push({ oldId, newId });
    }

    return proposals;
}

// ─── AI Call ─────────────────────────────────────────────────────────────

async function callProvider(prompt: string): Promise<string> {
    const config = getAiConfig();

    const callApi = async (
        url: string,
        body: unknown,
        headers: Record<string, string>
    ): Promise<any> => {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`API error (${response.status}): ${text}`);
        }
        return response.json();
    };

    switch (config.provider) {
        case "gemini": {
            if (!config.apiKey) throw new Error("NEEDS_SETTINGS");
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
            const data = await callApi(url, {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
            }, {});
            return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        }
        case "openai": {
            if (!config.apiKey) throw new Error("NEEDS_SETTINGS");
            const data = await callApi(
                "https://api.openai.com/v1/chat/completions",
                { model: config.model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 4096 },
                { Authorization: `Bearer ${config.apiKey}` }
            );
            return data.choices?.[0]?.message?.content ?? "";
        }
        case "anthropic": {
            if (!config.apiKey) throw new Error("NEEDS_SETTINGS");
            const data = await callApi(
                "https://api.anthropic.com/v1/messages",
                { model: config.model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] },
                { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" }
            );
            return data.content?.find((c: any) => c.type === "text")?.text ?? "";
        }
        case "ollama": {
            const data = await callApi(
                `${config.ollamaUrl}/api/generate`,
                { model: config.model, prompt, stream: false, options: { temperature: 0.2 } },
                {}
            );
            return data?.response ?? "";
        }
        case "openrouter": {
            if (!config.apiKey) throw new Error("NEEDS_SETTINGS");
            const data = await callApi(
                "https://openrouter.ai/api/v1/chat/completions",
                { model: config.model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 4096 },
                { Authorization: `Bearer ${config.apiKey}`, "HTTP-Referer": "https://github.com/khangnghiem/fast-draft", "X-Title": "Fast Draft" }
            );
            return data.choices?.[0]?.message?.content ?? "";
        }
        default:
            throw new Error(`Unknown provider: ${config.provider}`);
    }
}

// ─── Heuristic Renamer (No-API Fallback) ─────────────────────────────────

/** Lightweight context extracted from a node's FD block. */
interface NodeContext {
    id: string;
    type: string;         // rect, text, ellipse, group, frame, path, edge
    textContent?: string; // for text nodes: the quoted label
    parentId?: string;    // nearest named parent group/frame
    width?: number;
    height?: number;
    edgeTargets?: string[]; // IDs of nodes this node connects TO via edges
}

/**
 * Extract lightweight context for each anonymous node by scanning the FD text.
 * This is intentionally simple — no full parser, just line-by-line extraction.
 */
function extractNodeContexts(fdText: string, anonIds: Set<string>): Map<string, NodeContext> {
    const lines = fdText.split("\n");
    const contexts = new Map<string, NodeContext>();
    const parentStack: string[] = []; // stack of group/frame IDs
    let braceDepth = 0;
    const depthAtPush: number[] = [];
    let currentNode: NodeContext | null = null;

    const NODE_RE = /^\s*(group|frame|rect|ellipse|path|text)\s+@(\w+)(?:\s+"([^"]*)")?\s*\{?\s*$/;
    const WIDTH_RE = /\bw:\s*(\d+(?:\.\d+)?)/;
    const HEIGHT_RE = /\bh:\s*(\d+(?:\.\d+)?)/;
    const CONTENT_RE = /\bcontent:\s*"([^"]*)"/;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            // Count braces even in comments? No, skip.
            continue;
        }

        const openBraces = (trimmed.match(/\{/g) || []).length;
        const closeBraces = (trimmed.match(/\}/g) || []).length;

        // Check for node declaration
        const nodeMatch = trimmed.match(NODE_RE);
        if (nodeMatch) {
            const [, type, id, inlineText] = nodeMatch;
            const ctx: NodeContext = {
                id,
                type,
                parentId: parentStack.length > 0 ? parentStack[parentStack.length - 1] : undefined,
            };
            if (inlineText) ctx.textContent = inlineText;

            if (anonIds.has(id)) {
                contexts.set(id, ctx);
                currentNode = ctx;
            }

            // Push as parent if it's a group/frame and has opening brace
            if ((type === "group" || type === "frame") && trimmed.includes("{")) {
                parentStack.push(id);
                depthAtPush.push(braceDepth + openBraces);
            }

            braceDepth += openBraces - closeBraces;
            continue;
        }

        // Extract properties from current anonymous node's block
        if (currentNode && braceDepth > 0) {
            const wMatch = trimmed.match(WIDTH_RE);
            const hMatch = trimmed.match(HEIGHT_RE);
            const contentMatch = trimmed.match(CONTENT_RE);
            if (wMatch) currentNode.width = parseFloat(wMatch[1]);
            if (hMatch) currentNode.height = parseFloat(hMatch[1]);
            if (contentMatch && !currentNode.textContent) {
                currentNode.textContent = contentMatch[1];
            }
        }

        braceDepth += openBraces - closeBraces;

        // Pop parent stack on closing brace
        if (trimmed === "}") {
            while (depthAtPush.length > 0 && depthAtPush[depthAtPush.length - 1] > braceDepth) {
                depthAtPush.pop();
                parentStack.pop();
            }
            if (braceDepth <= 0) currentNode = null;
        }
    }

    // Second pass: scan for edge connections and populate edgeTargets
    const EDGE_FROM_RE = /\bfrom:\s*@(\w+)/;
    const EDGE_TO_RE = /\bto:\s*@(\w+)/;
    let currentEdgeFrom: string | null = null;
    let currentEdgeTo: string | null = null;
    let inEdge = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("edge ") || trimmed.startsWith("edge@")) {
            inEdge = true;
            currentEdgeFrom = null;
            currentEdgeTo = null;
            continue;
        }
        if (inEdge) {
            const fromMatch = trimmed.match(EDGE_FROM_RE);
            const toMatch = trimmed.match(EDGE_TO_RE);
            if (fromMatch) currentEdgeFrom = fromMatch[1];
            if (toMatch) currentEdgeTo = toMatch[1];
            if (trimmed === "}") {
                // Edge block closed — link from→to
                if (currentEdgeFrom && currentEdgeTo) {
                    const fromCtx = contexts.get(currentEdgeFrom);
                    if (fromCtx) {
                        if (!fromCtx.edgeTargets) fromCtx.edgeTargets = [];
                        fromCtx.edgeTargets.push(currentEdgeTo);
                    }
                }
                inEdge = false;
            }
        }
    }

    return contexts;
}

/**
 * Generate a semantic name from node context using heuristics.
 * Returns a sanitized snake_case name.
 */
function generateHeuristicName(ctx: NodeContext): string {
    const parts: string[] = [];

    // 1. Text content takes priority — "Login" → login
    if (ctx.textContent) {
        const cleaned = ctx.textContent
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .trim()
            .split(/\s+/)
            .slice(0, 3) // max 3 words
            .join("_");
        if (cleaned) {
            parts.push(cleaned);
            // Append type suffix for clarity if not already implied
            if (ctx.type !== "text") parts.push(ctx.type);
            else parts.push("label");
            return sanitizeToFdId(parts.join("_"));
        }
    }

    // 2. Edge connection — name by what I connect TO
    if (ctx.edgeTargets?.length) {
        const semanticTarget = ctx.edgeTargets.find(
            t => !/^_?(rect|ellipse|group|frame|path|text|edge)_\d+$/.test(t)
        );
        if (semanticTarget) {
            parts.push(`${ctx.type}_to_${semanticTarget}`);
            return sanitizeToFdId(parts.join("_"));
        }
    }

    // 3. Parent context — rect inside @sidebar → sidebar_rect
    if (ctx.parentId && !ctx.parentId.match(/^_?(group|frame)_\d+$/)) {
        // Parent has a semantic name, use it
        parts.push(ctx.parentId);
    }

    // 3. Shape detection for visual hints
    if (ctx.type === "ellipse" && ctx.width && ctx.height && ctx.width === ctx.height) {
        parts.push("circle");
    } else if (ctx.type === "rect" && ctx.width && ctx.height) {
        if (ctx.width > ctx.height * 3) {
            parts.push("bar");
        } else if (ctx.height > ctx.width * 3) {
            parts.push("column");
        } else {
            parts.push(ctx.type);
        }
    } else {
        parts.push(ctx.type);
    }

    const name = parts.join("_");
    return sanitizeToFdId(name) || ctx.type;
}

/**
 * Heuristic rename — generate semantic names from FD document context.
 * No AI required. Used as fallback when no API key is configured.
 */
export function heuristicRename(fdText: string): RenameProposal[] {
    const anonIds = findAnonymousNodeIds(fdText);
    if (anonIds.length === 0) return [];

    const existingIds = findAllNodeIds(fdText);
    const anonSet = new Set(anonIds);
    const contexts = extractNodeContexts(fdText, anonSet);
    const usedNames = new Set(existingIds);
    const proposals: RenameProposal[] = [];

    for (const oldId of anonIds) {
        const ctx = contexts.get(oldId);
        if (!ctx) continue;

        let newId = generateHeuristicName(ctx);
        if (!newId || newId === oldId) continue;

        // Resolve conflicts
        let candidate = newId;
        let suffix = 2;
        while (usedNames.has(candidate)) {
            candidate = `${newId}_${suffix}`;
            suffix++;
        }
        newId = candidate;

        usedNames.add(newId);
        proposals.push({ oldId, newId });
    }

    return proposals;
}

// ─── Main Entry Point ────────────────────────────────────────────────────

/**
 * Scan the document for anonymous IDs and propose semantic renames via AI.
 * Falls back to heuristic rename when no API key is configured.
 */
export async function callRenamifyAi(fdText: string): Promise<RenamifyResult> {
    const anonIds = findAnonymousNodeIds(fdText);
    if (anonIds.length === 0) {
        return { proposals: [], error: "No anonymous node IDs found." };
    }

    const existingIds = findAllNodeIds(fdText);
    const prompt = buildRenamifyPrompt(fdText, anonIds);

    try {
        const raw = await callProvider(prompt);
        const proposals = parseRenamifyResponse(raw.trim(), anonIds, existingIds);

        if (proposals.length === 0) {
            return {
                proposals: [],
                error: "AI returned no valid rename proposals. Try again.",
            };
        }

        return { proposals };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === "NEEDS_SETTINGS") {
            // Fall back to heuristic rename instead of erroring
            const proposals = heuristicRename(fdText);
            if (proposals.length > 0) {
                return { proposals };
            }
            const config = getAiConfig();
            return {
                proposals: [],
                error: `No renames possible. Configure ${config.provider} API key in Settings → fd.ai for smarter suggestions.`,
                needsSettings: true,
            };
        }
        return {
            proposals: [],
            error: `Renamify failed: ${message}`,
        };
    }
}

/**
 * Apply accepted renames globally across the entire document text.
 * Updates every @id reference — declarations, from:, to:, center_in:, use:, etc.
 */
export function applyGlobalRenames(
    fdText: string,
    renames: RenameProposal[]
): string {
    let result = fdText;
    for (const { oldId, newId } of renames) {
        // Replace @oldId with @newId everywhere (word boundary to avoid partial matches)
        const pattern = new RegExp(`@${escapeRegex(oldId)}\\b`, "g");
        result = result.replace(pattern, `@${newId}`);
    }
    return result;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

