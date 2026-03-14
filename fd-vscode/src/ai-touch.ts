/**
 * AI Refine service for FD nodes.
 *
 * Calls an LLM to rename auto-generated IDs with semantic names and
 * improve visual styling. Supports multiple providers with
 * per-provider API keys and custom model selection.
 */

import * as vscode from "vscode";
import {
  findAnonymousNodeIds as _findAnonymousNodeIds,
  stripMarkdownFences as _stripMarkdownFences,
} from "./fd-parse";

// ─── Constants ───────────────────────────────────────────────────────────

const CONFIG_SECTION = "fd.ai";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_OLLAMA_MODEL = "llama3.2";
const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.0-flash-exp:free";

// ─── Types ───────────────────────────────────────────────────────────────

type Provider = "gemini" | "openai" | "anthropic" | "ollama" | "openrouter";

interface AiConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  ollamaUrl: string;
}

interface RefineResult {
  refinedText: string;
  error?: string;
  /** When true, the caller should offer an "Open Settings" action. */
  needsSettings?: boolean;
}

// ─── Configuration ───────────────────────────────────────────────────────

/** Read AI settings from VS Code configuration. */
export function getAiConfig(): AiConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const provider = (config.get<string>("provider") ?? "gemini") as Provider;

  // Per-provider API keys and models
  const keyMap: Record<Provider, string> = {
    gemini: config.get<string>("geminiApiKey") ?? "",
    openai: config.get<string>("openaiApiKey") ?? "",
    anthropic: config.get<string>("anthropicApiKey") ?? "",
    ollama: "", // No key needed
    openrouter: config.get<string>("openrouterApiKey") ?? "",
  };

  const modelMap: Record<Provider, string> = {
    gemini: config.get<string>("geminiModel") ?? DEFAULT_GEMINI_MODEL,
    openai: config.get<string>("openaiModel") ?? DEFAULT_OPENAI_MODEL,
    anthropic: config.get<string>("anthropicModel") ?? DEFAULT_ANTHROPIC_MODEL,
    ollama: config.get<string>("ollamaModel") ?? DEFAULT_OLLAMA_MODEL,
    openrouter: config.get<string>("openrouterModel") ?? DEFAULT_OPENROUTER_MODEL,
  };

  return {
    provider,
    apiKey: keyMap[provider],
    model: modelMap[provider],
    ollamaUrl: config.get<string>("ollamaUrl") ?? DEFAULT_OLLAMA_URL,
  };
}

// ─── Prompt ──────────────────────────────────────────────────────────────

function buildRefinePrompt(fdText: string, nodeIds: string[]): string {
  const targetList = nodeIds.map((id) => `@${id}`).join(", ");
  return `You are an expert UI designer working with the FD (Fast Draft) format.

Given the .fd document below, improve the following nodes: ${targetList}

## Rules

1. **Rename auto-generated IDs**: Replace any \`@_kind_N\` (like \`@_rect_0\`, \`@_text_3\`) with a short, semantic snake_case name that describes the node's purpose (e.g., \`@hero_card\`, \`@nav_btn\`). Max 15 characters. If a name would collide with an existing ID, append a number suffix (e.g., \`@card_1\`).

2. **Restyle for visual polish**: Improve colors (use harmonious hex palettes, not generic red/blue), add rounded corners where missing, adjust spacing/sizing for better proportions. Follow modern design best practices.

3. **Preserve structure**: Do NOT add, remove, or reorder nodes. Do NOT change layout types or constraint relationships. Only change IDs and visual properties (fill, stroke, corner, opacity, font).

4. **Output the COMPLETE refined .fd document** — not just the changed nodes. This is critical for correct round-tripping.

5. **Output ONLY valid FD text** — no markdown fences, no explanations, no comments about changes. Just the raw .fd content.

## FD Document

${fdText}`;
}

// ─── API Calls ───────────────────────────────────────────────────────────

async function callAiApi(url: string, body: any, headers: Record<string, string>): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

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

  const data = await callAiApi(url, body, {});

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return text.trim();
}

async function callOpenAi(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";

  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 8192,
  };

  const data = await callAiApi(url, body, {
    Authorization: `Bearer ${apiKey}`,
  });

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI returned empty response");
  }

  return text.trim();
}

async function callAnthropic(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const url = "https://api.anthropic.com/v1/messages";

  const body = {
    model,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  };

  const data = await callAiApi(url, body, {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  });

  const text = data.content?.find((c: any) => c.type === "text")?.text;
  if (!text) {
    throw new Error("Anthropic returned empty response");
  }

  return text.trim();
}

async function callOllama(
  prompt: string,
  model: string,
  baseUrl: string
): Promise<string> {
  const url = `${baseUrl}/api/generate`;

  const body = {
    model,
    prompt,
    stream: false,
    options: { temperature: 0.3 },
  };

  let data;
  try {
    data = await callAiApi(url, body, {});
  } catch (error) {
    if (error instanceof Error && error.message.includes("API error")) {
        throw error;
    }
    throw new Error(
      `Could not connect to Ollama at ${baseUrl}. Make sure Ollama is running.`
    );
  }

  if (!data?.response) {
    throw new Error("Ollama returned empty response");
  }

  return data.response.trim();
}

async function callOpenRouter(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 8192,
  };

  const data = await callAiApi(url, body, {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "https://github.com/khangnghiem/fast-draft",
    "X-Title": "Fast Draft",
  });

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenRouter returned empty response");
  }

  return text.trim();
}

// ─── Main Entry Point ────────────────────────────────────────────────────

/**
 * Refine selected nodes using AI.
 *
 * @param fdText  Full .fd document text
 * @param nodeIds Node IDs to refine (e.g., ["_rect_0", "_text_3"])
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
      case "gemini":
        if (!config.apiKey) {
          return {
            refinedText: fdText,
            error:
              "Gemini API key not configured. Get a FREE key at aistudio.google.com and set 'fd.ai.geminiApiKey' in Settings. (You can also switch to OpenAI, Anthropic, Ollama, or OpenRouter.)",
            needsSettings: true,
          };
        }
        refined = await callGemini(prompt, config.apiKey, config.model);
        break;

      case "openai":
        if (!config.apiKey) {
          return {
            refinedText: fdText,
            error:
              "OpenAI API key not configured. Set 'fd.ai.openaiApiKey' in Settings. (You can also switch to Gemini, Anthropic, Ollama, or OpenRouter.)",
            needsSettings: true,
          };
        }
        refined = await callOpenAi(prompt, config.apiKey, config.model);
        break;

      case "anthropic":
        if (!config.apiKey) {
          return {
            refinedText: fdText,
            error:
              "Anthropic API key not configured. Set 'fd.ai.anthropicApiKey' in Settings. (You can also switch to Gemini, OpenAI, Ollama, or OpenRouter.)",
            needsSettings: true,
          };
        }
        refined = await callAnthropic(prompt, config.apiKey, config.model);
        break;

      case "ollama":
        refined = await callOllama(prompt, config.model, config.ollamaUrl);
        break;

      case "openrouter":
        if (!config.apiKey) {
          return {
            refinedText: fdText,
            error:
              "OpenRouter API key not configured. Get one at openrouter.ai and set 'fd.ai.openrouterApiKey' in Settings. (You can also switch to Gemini, OpenAI, Anthropic, or Ollama.)",
            needsSettings: true,
          };
        }
        refined = await callOpenRouter(prompt, config.apiKey, config.model);
        break;

      default:
        return {
          refinedText: fdText,
          error: `Unknown provider: ${config.provider}`,
        };
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
 * Find all auto-generated node IDs in an FD document.
 * Delegates to fd-parse; re-exported for backward-compatible imports.
 */
export function findAnonNodeIds(fdText: string): string[] {
  return _findAnonymousNodeIds(fdText);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Strip ```fd or ```text fences from LLM output. */
function stripMarkdownFences(text: string): string {
  return _stripMarkdownFences(text);
}
