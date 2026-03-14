/**
 * Cloudflare Pages Function — AI endpoint for FD playground.
 * Smart model routing: 8B for refine/renamify, 70B for review.
 *
 * Bindings required:
 *   - AI (Workers AI)
 *   - RATE_LIMIT (KV Namespace) — for daily per-IP counters
 *
 * Environment variables (optional):
 *   - AI_DAILY_LIMIT: max calls/day/IP (default: 10)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const DEFAULT_DAILY_LIMIT = 10;
const KV_TTL_SECONDS = 86400;

// ─── Models ──────────────────────────────────────────────────────────────

const MODEL_8B = '@cf/meta/llama-3.1-8b-instruct';
const MODEL_70B = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ─── FD Format Guide ─────────────────────────────────────────────────────

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

async function checkRateLimit(context, cost = 1) {
  const kv = context.env.RATE_LIMIT;
  if (!kv) return { allowed: true, remaining: -1, limit: -1 };

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  const today = new Date().toISOString().slice(0, 10);
  const key = `ai:${ip}:${today}`;
  const limit = parseInt(context.env.AI_DAILY_LIMIT || DEFAULT_DAILY_LIMIT, 10);

  const current = parseInt(await kv.get(key) || '0', 10);

  if (current + cost > limit) {
    return { allowed: false, remaining: Math.max(0, limit - current), limit, needed: cost };
  }

  await kv.put(key, String(current + cost), { expirationTtl: KV_TTL_SECONDS });
  return { allowed: true, remaining: limit - current - cost, limit };
}

function rateLimitHeaders(rateInfo) {
  return {
    'X-RateLimit-Limit': String(rateInfo.limit),
    'X-RateLimit-Remaining': String(rateInfo.remaining),
    ...(rateInfo.remaining < 0 ? {} : {}),
  };
}

// ─── Model + Prompt Selection ────────────────────────────────────────────

function getModelConfig(mode) {
  switch (mode) {
    case 'renamify':
      return {
        model: MODEL_8B,
        system: `You are a UI naming expert. Return ONLY a valid JSON object mapping old node IDs to new semantic names. No markdown, no explanation.${FD_SYNTAX_GUIDE}`,
        maxTokens: 4096,
        temp: 0.3,
      };
    case 'refine':
      return {
        model: MODEL_8B,
        system: `You are an expert UI designer working with the FD (Fast Draft) format. Return ONLY valid FD text with improved styling and semantic naming. No markdown fences, no explanations.${FD_SYNTAX_GUIDE}`,
        maxTokens: 4096,
        temp: 0.4,
      };
    case 'review-scoped':
      return {
        model: MODEL_70B,
        system: `You are a professional design auditor for FD (Fast Draft) documents. Analyze the given FD nodes and return a JSON object with this exact structure:
{
  "categories": [
    {
      "name": "Naming",
      "icon": "📝",
      "findings": [{"severity": "error"|"warning"|"info", "message": "...", "suggestion": "..."}]
    },
    {
      "name": "Colors & Visuals",
      "icon": "🎨",
      "findings": [...]
    },
    {
      "name": "Structure & Layout",
      "icon": "📐",
      "findings": [...]
    }
  ]
}
Return ONLY valid JSON. No markdown fences, no explanations.`,
        maxTokens: 4096,
        temp: 0.2,
      };
    default:
      return {
        model: MODEL_8B,
        system: `You are an expert UI designer. Return ONLY valid FD text.${FD_SYNTAX_GUIDE}`,
        maxTokens: 4096,
        temp: 0.3,
      };
  }
}

// ─── Request Handler ─────────────────────────────────────────────────────

export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json', ...CORS_HEADERS };

  try {
    const rateInfo = await checkRateLimit(context);
    Object.assign(headers, rateLimitHeaders(rateInfo));

    if (!rateInfo.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        message: `Free tier: ${rateInfo.limit} AI calls/day. Upgrade for unlimited.`,
        remaining: 0,
        limit: rateInfo.limit,
      }), { status: 429, headers });
    }

    const { prompt, mode } = await context.request.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt' }), {
        status: 400, headers,
      });
    }

    if (!context.env.AI) {
      return new Response(JSON.stringify({
        error: 'Workers AI binding not configured.',
      }), { status: 503, headers });
    }

    const config = getModelConfig(mode);

    const result = await context.env.AI.run(config.model, {
      messages: [
        { role: 'system', content: config.system },
        { role: 'user', content: prompt },
      ],
      max_tokens: config.maxTokens,
      temperature: config.temp,
    });

    return new Response(JSON.stringify({
      result: result.response,
      model: config.model.includes('70b') ? '70B' : '8B',
      remaining: rateInfo.remaining,
      limit: rateInfo.limit,
    }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'AI request failed' }), {
      status: 500, headers,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}
