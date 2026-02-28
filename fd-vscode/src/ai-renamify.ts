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

function buildRenamifyPrompt(fdText: string, anonIds: string[]): string {
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
function parseRenamifyResponse(
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

// ─── Main Entry Point ────────────────────────────────────────────────────

/**
 * Scan the document for anonymous IDs and propose semantic renames via AI.
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
            const config = getAiConfig();
            return {
                proposals: [],
                error: `${config.provider} API key not configured. Set it in Settings → fd.ai.`,
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
