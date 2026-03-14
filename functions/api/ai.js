/**
 * Cloudflare Pages Function — AI endpoint for FD playground.
 * Uses Cloudflare Workers AI with IP-based rate limiting.
 *
 * Bindings required (configure in Cloudflare Dashboard →
 * Pages → fast-draft → Settings → Functions → Bindings):
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
const KV_TTL_SECONDS = 86400; // 24 hours

// ─── FD Format Guide (injected into prompts) ────────────────────────────

const FD_SYNTAX_GUIDE = `
## FD Format Reference

Node types: rect, ellipse, text, frame, group, path, image
Properties: fill:#HEX, stroke:#HEX N, corner:N, opacity:0-1, font:"Name" Npx bold
Layout: layout: column|row gap=N pad=N, place: center|top_left|bottom_right
Constraints: center_in: @parent, offset: @ref dx dy
Styles: style card_style { fill: #1A1A2E corner: 12 } → use: card_style
Edges: edge @id { from: @a to: @b arrow: end curve: smooth }
Notes: note "description" or note { markdown content }

Rules:
- IDs are semantic snake_case: @hero_card not @_rect_0
- Colors use harmonious palettes, not random hex
- Use style blocks for repeated properties (DRY)
- Prefer constraints over absolute coordinates
`;

// ─── Rate Limiting ───────────────────────────────────────────────────────

async function checkRateLimit(context) {
  const kv = context.env.RATE_LIMIT;
  if (!kv) return { allowed: true, remaining: -1, limit: -1 }; // No KV = no limit

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `ai:${ip}:${today}`;
  const limit = parseInt(context.env.AI_DAILY_LIMIT || DEFAULT_DAILY_LIMIT, 10);

  const current = parseInt(await kv.get(key) || '0', 10);

  if (current >= limit) {
    return { allowed: false, remaining: 0, limit, resetAt: today + 'T23:59:59Z' };
  }

  await kv.put(key, String(current + 1), { expirationTtl: KV_TTL_SECONDS });
  return { allowed: true, remaining: limit - current - 1, limit };
}

function rateLimitHeaders(rateInfo) {
  return {
    'X-RateLimit-Limit': String(rateInfo.limit),
    'X-RateLimit-Remaining': String(rateInfo.remaining),
    ...(rateInfo.resetAt ? { 'Retry-After': '3600' } : {}),
  };
}

// ─── Request Handler ─────────────────────────────────────────────────────

export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json', ...CORS_HEADERS };

  try {
    // Rate limit check
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
        status: 400,
        headers,
      });
    }

    if (!context.env.AI) {
      return new Response(JSON.stringify({
        error: 'Workers AI binding not configured. Add AI binding in Cloudflare Dashboard → Pages → Settings → Functions.',
      }), { status: 503, headers });
    }

    const systemPrompt = mode === 'renamify'
      ? `You are a UI naming expert. Return ONLY a valid JSON object mapping old node IDs to new semantic names. No markdown, no explanation.${FD_SYNTAX_GUIDE}`
      : `You are an expert UI designer working with the FD (Fast Draft) format. Return ONLY valid FD text. No markdown fences, no explanations.${FD_SYNTAX_GUIDE}`;

    const result = await context.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 8192,
      temperature: 0.3,
    });

    return new Response(JSON.stringify({
      result: result.response,
      remaining: rateInfo.remaining,
      limit: rateInfo.limit,
    }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'AI request failed' }), {
      status: 500,
      headers,
    });
  }
}

// Handle OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}
