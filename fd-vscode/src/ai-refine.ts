/**
 * AI Refine service for FD nodes.
 *
 * Calls an LLM to rename _anon_ IDs with semantic names and
 * improve visual styling. Supports free-tier Gemini and BYOK.
 */

import * as vscode from "vscode";

// ─── Types ───────────────────────────────────────────────────────────────

interface AiConfig {
  provider: "gemini-free" | "gemini" | "openai";
  apiKey: string;
}

interface RefineResult {
  refinedText: string;
  error?: string;
}

// ─── Configuration ───────────────────────────────────────────────────────

/** Read AI settings from VS Code configuration. */
export function getAiConfig(): AiConfig {
  const config = vscode.workspace.getConfiguration("fd.ai");
  const provider = (config.get<string>("provider") ?? "gemini-free") as AiConfig["provider"];
  const apiKey = config.get<string>("apiKey") ?? "";
  return { provider, apiKey };
}

// ─── Prompt ──────────────────────────────────────────────────────────────

function buildRefinePrompt(fdText: string, nodeIds: string[]): string {
  const targetList = nodeIds.map((id) => `@${id}`).join(", ");
  return `You are an expert UI designer working with the FD (Fast Draft) format.

Given the .fd document below, improve the following nodes: ${targetList}

## Rules

1. **Rename _anon_ IDs**: Replace any \`@_anon_N\` with a short, semantic snake_case name that describes the node's purpose (e.g., \`@hero_card\`, \`@nav_btn\`). Max 15 characters. If a name would collide with an existing ID, append a number suffix (e.g., \`@card_1\`).

2. **Restyle for visual polish**: Improve colors (use harmonious hex palettes, not generic red/blue), add rounded corners where missing, adjust spacing/sizing for better proportions. Follow modern design best practices.

3. **Preserve structure**: Do NOT add, remove, or reorder nodes. Do NOT change layout types or constraint relationships. Only change IDs and visual properties (fill, stroke, corner, opacity, font).

4. **Output the COMPLETE refined .fd document** — not just the changed nodes. This is critical for correct round-tripping.

5. **Output ONLY valid FD text** — no markdown fences, no explanations, no comments about changes. Just the raw .fd content.

## FD Document

${fdText}`;
}

// ─── API Calls ───────────────────────────────────────────────────────────

async function callGemini(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return text.trim();
}

async function callOpenAi(prompt: string, apiKey: string): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";

  const body = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 8192,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI returned empty response");
  }

  return text.trim();
}

// ─── Main Entry Point ────────────────────────────────────────────────────

/**
 * Refine selected nodes using AI.
 *
 * @param fdText  Full .fd document text
 * @param nodeIds Node IDs to refine (e.g., ["_anon_0", "_anon_3"])
 * @returns The complete refined .fd text
 */
export async function refineSelectedNodes(
  fdText: string,
  nodeIds: string[]
): Promise<RefineResult> {
  if (nodeIds.length === 0) {
    return { refinedText: fdText, error: "No nodes selected for refinement" };
  }

  const config = getAiConfig();
  const prompt = buildRefinePrompt(fdText, nodeIds);

  try {
    let refined: string;

    switch (config.provider) {
      case "gemini-free":
        refined = await callGemini(
          prompt,
          config.apiKey || getFreeTierKey(),
          "gemini-2.0-flash"
        );
        break;

      case "gemini":
        if (!config.apiKey) {
          return {
            refinedText: fdText,
            error: "Gemini API key not configured. Set fd.ai.apiKey in settings.",
          };
        }
        refined = await callGemini(prompt, config.apiKey, "gemini-2.0-flash");
        break;

      case "openai":
        if (!config.apiKey) {
          return {
            refinedText: fdText,
            error: "OpenAI API key not configured. Set fd.ai.apiKey in settings.",
          };
        }
        refined = await callOpenAi(prompt, config.apiKey);
        break;

      default:
        return { refinedText: fdText, error: `Unknown provider: ${config.provider}` };
    }

    // Strip markdown fences if the model wrapped the output
    refined = stripMarkdownFences(refined);

    // Basic validation: must contain at least one node keyword
    if (!refined.match(/\b(rect|ellipse|text|group|path)\b/)) {
      return {
        refinedText: fdText,
        error: "AI returned invalid FD text. Original preserved.",
      };
    }

    return { refinedText: refined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { refinedText: fdText, error: `AI Refine failed: ${message}` };
  }
}

/**
 * Find all _anon_ node IDs in an FD document.
 */
export function findAnonNodeIds(fdText: string): string[] {
  const matches = fdText.matchAll(/@(_anon_\d+)/g);
  const ids = new Set<string>();
  for (const m of matches) {
    ids.add(m[1]);
  }
  return [...ids];
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Strip ```fd or ```text fences from LLM output. */
function stripMarkdownFences(text: string): string {
  // Remove leading ```fd or ```text or ``` and trailing ```
  let result = text;
  result = result.replace(/^```(?:fd|text|plaintext)?\s*\n?/, "");
  result = result.replace(/\n?```\s*$/, "");
  return result.trim();
}

/**
 * Free-tier Gemini API key.
 * Rate-limited but functional for casual use.
 * Users should configure their own key for production use.
 */
function getFreeTierKey(): string {
  // This is a free-tier key with strict rate limits.
  // For production use, users should set their own key in fd.ai.apiKey.
  return vscode.workspace.getConfiguration("fd.ai").get<string>("freeTierKey") ?? "";
}
