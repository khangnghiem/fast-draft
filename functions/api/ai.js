/**
 * Cloudflare Pages Function — Single AI endpoint for FD web editor.
 * Handles all AI modes: refine, renamify, review.
 *
 * Bindings required:
 *   - AI (Workers AI)
 *   - RATE_LIMIT (KV Namespace)
 *
 * Environment variables:
 *   - AI_DAILY_LIMIT: max calls/day/IP (default: 20)
 *   - AI_MODEL_FAST: model for refine/renamify (default: gemma-3-12b-it)
 *   - AI_MODEL_QUALITY: model for review (default: gemma-3-12b-it)
 */

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';

  // Whitelist exact matches and prefix matches
  const isAllowed =
    origin === 'https://fast-draft.com' ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('vscode-webview://');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'https://fast-draft.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

const DEFAULT_DAILY_LIMIT = 20;
const KV_TTL_SECONDS = 86400;

// ─── Default Models (override via env vars) ──────────────────────────────

const DEFAULT_MODEL_FAST = '@cf/google/gemma-3-12b-it';
const DEFAULT_MODEL_QUALITY = '@cf/google/gemma-3-12b-it';

// ─── Model Aliases (for admin URL param override) ────────────────────────

const MODEL_ALIASES = {
  // Meta Llama
  'llama-1b':       '@cf/meta/llama-3.2-1b-instruct',
  'llama-3b':       '@cf/meta/llama-3.2-3b-instruct',
  'llama-8b':       '@cf/meta/llama-3.1-8b-instruct',
  'llama-8b-fast':  '@cf/meta/llama-3.1-8b-instruct-fast',
  'llama-70b':      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  'llama-scout':    '@cf/meta/llama-4-scout-17b-16e-instruct',
  // Google Gemma
  'gemma-12b':      '@cf/google/gemma-3-12b-it',
  // Qwen
  'qwen-coder':     '@cf/qwen/qwen2.5-coder-32b-instruct',
  'qwen-30b':       '@cf/qwen/qwen3-30b-a3b-fp8',
  'qwq-32b':        '@cf/qwen/qwq-32b',
  // Mistral
  'mistral-24b':    '@cf/mistral/mistral-small-3.1-24b-instruct',
  // OpenAI
  'gpt-20b':        '@cf/openai/gpt-oss-20b',
  'gpt-120b':       '@cf/openai/gpt-oss-120b',
  // NVIDIA
  'nemotron-120b':  '@cf/nvidia/nemotron-3-120b-a12b',
  // DeepSeek
  'deepseek-r1':    '@cf/deepseek/deepseek-r1-distill-qwen-32b',
  // IBM
  'granite':        '@cf/ibm/granite-4.0-h-micro',
  // GLM
  'glm-flash':      '@cf/zai-org/glm-4.7-flash',
};

// ─── FD Syntax Guide (compressed + golden example) ──────────────────────

const FD_SYNTAX_GUIDE = `
## FD Syntax (compressed)

Nodes: rect|ellipse|text|frame|group|path|image @id { props }
Props: fill:#HEX stroke:#HEX_N corner:N opacity:0-1 font:"F" Npx bold|semibold
Layout: layout: column|row gap=N pad=N, place: center|top_left
Constraints: center_in: @parent, offset: @ref dx dy
Style: style name { ... } → use: name
Edge: edge @id { from: @a to: @b arrow: end curve: smooth }
Note: note { "text" tag: x done: "y" }
Hover: when :hover { fill: #HEX ease: ease_out 150ms }

## Golden Example (from a well-designed FD document)

style card { fill: #FFFFFF corner: 14 }
style brand { fill: #6C5CE7 corner: 12 }
style heading { fill: #1A1A2E font: "Inter" bold 22 }
style body { fill: #6B7280 font: "Inter" regular 14 }

rect @hero_card {
  w: 220 h: 120
  use: card
  shadow: (0,2,16,#00000010)
  when :hover { scale: 1 ease: spring 200ms }
}

frame @sidebar {
  layout: column gap=8 pad=16
  fill: #2D2B55 corner: 0
  rect @nav_dashboard { w: 180 h: 40 fill: #5A4BD1 corner: 8 }
}

edge @build_to_test { from: @stage_build to: @stage_test stroke: #6B7080 1.5 flow: pulse 800ms }

Rules: IDs=semantic snake_case. Colors=harmonious palettes. DRY=use style blocks. Constraints>coords.
`;

// ─── Rate Limiting ───────────────────────────────────────────────────────

async function checkRateLimit(context) {
  const kv = context.env.RATE_LIMIT;
  if (!kv) return { allowed: true, remaining: -1, limit: -1 };

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  const today = new Date().toISOString().slice(0, 10);
  const key = `ai:${ip}:${today}`;
  const limit = parseInt(context.env.AI_DAILY_LIMIT || DEFAULT_DAILY_LIMIT, 10);

  const current = parseInt(await kv.get(key) || '0', 10);

  if (current >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  await kv.put(key, String(current + 1), { expirationTtl: KV_TTL_SECONDS });
  return { allowed: true, remaining: limit - current - 1, limit };
}

// ─── Model + Prompt Selection ────────────────────────────────────────────

function getModelConfig(mode, env) {
  const fastModel = env.AI_MODEL_FAST || DEFAULT_MODEL_FAST;
  const qualityModel = env.AI_MODEL_QUALITY || DEFAULT_MODEL_QUALITY;

  switch (mode) {
    case 'chat':
      return {
        model: fastModel,
        system: `You are an expert UI designer and coding assistant working with the FD (Fast Draft) design format. You help users create, modify, and improve their designs through natural conversation.

When the user asks you to modify their design:
1. Return the COMPLETE modified FD blocks (only the ones you changed)
2. Wrap each modified block in a \`\`\`fd code fence
3. Brief explanation before each block

When answering questions, be concise and helpful. Always reference node @ids when discussing specific elements.
${FD_SYNTAX_GUIDE}`,
        maxTokens: 4096,
        temp: 0.4,
        isChat: true,
      };
    case 'renamify':
      return {
        model: fastModel,
        system: `You are a UI naming expert. Return ONLY a valid JSON object mapping old node IDs to new semantic names. No markdown, no explanation.${FD_SYNTAX_GUIDE}`,
        maxTokens: 4096,
        temp: 0.3,
      };
    case 'refine':
      return {
        model: fastModel,
        system: `You are an expert UI designer working with the FD (Fast Draft) format. Return ONLY valid FD text with improved styling and semantic naming. No markdown fences, no explanations.${FD_SYNTAX_GUIDE}`,
        maxTokens: 4096,
        temp: 0.4,
      };
    case 'review':
      return {
        model: qualityModel,
        system: `You are a professional design auditor for FD (Fast Draft) documents. Analyze the given FD text and return a JSON object with this exact structure:
{
  "categories": [
    {"name": "Naming", "icon": "📝", "findings": [{"severity": "error"|"warning"|"info", "message": "...", "suggestion": "..."}]},
    {"name": "Colors & Visuals", "icon": "🎨", "findings": [...]},
    {"name": "Structure & Layout", "icon": "📐", "findings": [...]}
  ]
}

Example input:
rect @_rect_0 { w: 200 h: 120 fill: #FF0000 corner: 0 }

Example output:
{"categories":[{"name":"Naming","icon":"📝","findings":[{"severity":"error","message":"Anonymous ID @_rect_0 — should be semantic","suggestion":"Rename to @hero_card or @action_btn based on purpose"}]},{"name":"Colors & Visuals","icon":"🎨","findings":[{"severity":"warning","message":"Raw red #FF0000 — not from a design palette","suggestion":"Use harmonious color like #6C5CE7 or #EF4444"},{"severity":"warning","message":"No corner radius — looks harsh","suggestion":"Add corner: 12 for modern feel"}]},{"name":"Structure & Layout","icon":"📐","findings":[{"severity":"info","message":"No shadow or hover state","suggestion":"Add shadow: (0,2,16,#00000010) and when :hover for interactivity"}]}]}

Return ONLY valid JSON. No markdown fences, no explanations. Empty findings array if perfect.`,
        maxTokens: 4096,
        temp: 0.2,
      };
    default:
      return {
        model: fastModel,
        system: `You are an expert UI designer. Return ONLY valid FD text.${FD_SYNTAX_GUIDE}`,
        maxTokens: 4096,
        temp: 0.3,
      };
  }
}

// ─── Scoring Helper ──────────────────────────────────────────────────────

function computeScore(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return 100;

  let total = 0;
  for (const cat of categories) {
    let catScore = 100;
    for (const f of (cat.findings || [])) {
      if (f.severity === 'error') catScore -= 15;
      else if (f.severity === 'warning') catScore -= 7;
      else catScore -= 2;
    }
    cat.score = Math.max(0, Math.min(100, catScore));
    total += cat.score;
  }
  return Math.round(total / categories.length);
}

// ─── Request Handler ─────────────────────────────────────────────────────

export async function onRequestPost(context) {
  const corsHeaders = getCorsHeaders(context.request);
  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders,
  };

  try {
    const rateInfo = await checkRateLimit(context);

    headers['X-RateLimit-Limit'] = String(rateInfo.limit);
    headers['X-RateLimit-Remaining'] = String(rateInfo.remaining);

    if (!rateInfo.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        message: `Free tier: ${rateInfo.limit} AI calls/day. Upgrade for unlimited.`,
        remaining: 0,
        limit: rateInfo.limit,
      }), { status: 429, headers });
    }

    const body = await context.request.json();
    const { prompt, mode, model_hint, user_focus, messages, context: docContext, selection, selection_ids } = body;

    // Chat mode requires messages array; other modes require prompt
    if (mode === 'chat') {
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: 'Chat mode requires messages array' }), {
          status: 400, headers,
        });
      }
    } else if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt' }), {
        status: 400, headers,
      });
    }

    if (!context.env.AI) {
      return new Response(JSON.stringify({
        error: 'Workers AI binding not configured.',
      }), { status: 503, headers });
    }

    const config = getModelConfig(mode, context.env);

    // Admin model override via URL param (validated against whitelist)
    if (model_hint && MODEL_ALIASES[model_hint]) {
      config.model = MODEL_ALIASES[model_hint];
    }

    // Append user focus to system prompt (if provided)
    if (user_focus && typeof user_focus === 'string' && user_focus.trim()) {
      config.system += `\n\n## User Focus\n${user_focus.trim().slice(0, 200)}`;
    }

    // Build messages for AI call
    let aiMessages;
    if (config.isChat) {
      // Chat mode: include document context in system prompt + conversation history
      let systemPrompt = config.system;
      if (docContext && typeof docContext === 'string') {
        systemPrompt += `\n\n## Current Document\n\`\`\`fd\n${docContext.slice(0, 8000)}\n\`\`\``;
      }
      // Inject selection context so AI knows what the user is looking at
      if (selection && typeof selection === 'string' && selection.trim()) {
        systemPrompt += `\n\n## Selected Nodes\nThe user currently has these nodes selected on the canvas:\n\`\`\`fd\n${selection.slice(0, 4000)}\n\`\`\`\nWhen the user refers to "this", "these", or "the selected", they mean the nodes above. Prioritize modifying these nodes in your response.`;
      } else if (selection_ids && Array.isArray(selection_ids) && selection_ids.length > 0) {
        systemPrompt += `\n\n## Selected Nodes\nThe user has these nodes selected: ${selection_ids.map(id => '@' + id).join(', ')}. When they refer to "this" or "these", they mean these nodes.`;
      }
      aiMessages = [
        { role: 'system', content: systemPrompt },
        // Include up to 10 most recent messages for context window management
        ...messages.slice(-10).map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: String(m.content).slice(0, 4000),
        })),
      ];
    } else {
      aiMessages = [
        { role: 'system', content: config.system },
        { role: 'user', content: prompt },
      ];
    }

    // ─── Streaming mode for chat ───────────────────────────────
    const wantsStream = config.isChat && body.stream === true;

    if (wantsStream) {
      // Use Cloudflare Workers AI streaming — returns a ReadableStream of SSE
      const stream = await context.env.AI.run(config.model, {
        messages: aiMessages,
        max_tokens: config.maxTokens,
        temperature: config.temp,
        stream: true,
      });

      return new Response(stream, {
        headers: {
          ...headers,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // ─── Non-streaming (full JSON response) ──────────────────
    const result = await context.env.AI.run(config.model, {
      messages: aiMessages,
      max_tokens: config.maxTokens,
      temperature: config.temp,
    });

    let responseBody;

    if (mode === 'review') {
      // Parse review JSON and compute scores
      const text = (result.response || '').trim();
      const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/);
      let reviewData = { categories: [], score: 100, totalFindings: 0 };

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.categories) {
            const score = computeScore(parsed.categories);
            reviewData = {
              score,
              categories: parsed.categories,
              totalFindings: parsed.categories.reduce((n, c) => n + (c.findings?.length || 0), 0),
            };
          } else if (Array.isArray(parsed)) {
            // Fallback: array of findings → wrap in single category
            const cat = { name: 'Review', icon: '📋', findings: parsed };
            const score = computeScore([cat]);
            reviewData = { score, categories: [cat], totalFindings: parsed.length };
          }
        } catch (_) {
          // JSON parse failed — return empty review
        }
      }

      responseBody = {
        ...reviewData,
        model: config.model,
        remaining: rateInfo.remaining,
        limit: rateInfo.limit,
      };
    } else {
      responseBody = {
        result: result.response,
        model: config.model,
        remaining: rateInfo.remaining,
        limit: rateInfo.limit,
      };
    }

    return new Response(JSON.stringify(responseBody), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'AI request failed' }), {
      status: 500, headers,
    });
  }
}

export async function onRequestOptions(context) {
  const corsHeaders = getCorsHeaders(context.request);
  return new Response(null, { headers: corsHeaders });
}
