/**
 * Cloudflare Pages Function — Design Review endpoint.
 * Supports both scoped (selected nodes) and full-doc review.
 *
 * Bindings: AI (Workers AI), RATE_LIMIT (KV Namespace)
 *
 * Modes:
 *   - scoped: 1 LLM call (70B) for selected nodes → costs 1 credit
 *   - full:   3 parallel LLM calls (70B) for entire doc → costs 3 credits
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const DEFAULT_DAILY_LIMIT = 10;
const KV_TTL_SECONDS = 86400;

// ─── Rate Limiting ───────────────────────────────────────────────────────

async function checkRateLimit(context, cost) {
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

// ─── Review Prompts ──────────────────────────────────────────────────────

const SCOPED_REVIEW_PROMPT = `You are a professional design auditor for FD (Fast Draft) format.
Analyze ONLY the given FD nodes. Return a JSON object with this exact structure:
{
  "categories": [
    {"name": "Naming", "icon": "📝", "findings": [{"severity": "error"|"warning"|"info", "message": "...", "suggestion": "..."}]},
    {"name": "Colors & Visuals", "icon": "🎨", "findings": [...]},
    {"name": "Structure & Layout", "icon": "📐", "findings": [...]}
  ]
}
Return ONLY valid JSON. No markdown, no explanations. Empty findings array if perfect.`;

const NAMING_PROMPT = `You are an FD code quality auditor. Check naming: anonymous IDs, non-descriptive names, inconsistent conventions, missing IDs. Return ONLY a JSON array of findings: [{"severity":"error"|"warning"|"info","message":"...","nodeId":"...","suggestion":"..."}]. Empty array if perfect.`;

const VISUAL_PROMPT = `You are a UI designer auditing FD. Check: color harmony, spacing consistency, contrast, corner radius consistency, typography hierarchy. Return ONLY a JSON array of findings: [{"severity":"error"|"warning"|"info","message":"...","nodeId":"...","suggestion":"..."}]. Empty array if perfect.`;

const STRUCTURE_PROMPT = `You are an FD architecture auditor. Check: style reuse (inline vs use:), absolute positions vs constraints, hierarchy (groups/frames), accessibility (min 44×44), edge_defaults. Return ONLY a JSON array of findings: [{"severity":"error"|"warning"|"info","message":"...","suggestion":"..."}]. Empty array if perfect.`;

// ─── LLM Helpers ─────────────────────────────────────────────────────────

async function runLLM(ai, systemPrompt, userContent) {
  try {
    const result = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    });

    const text = (result.response || '').trim();
    // Extract JSON from response (handle markdown fences)
    const jsonMatch = text.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return [];
  } catch (err) {
    console.error('LLM error:', err);
    return [];
  }
}

function computeScore(findings) {
  let score = 100;
  for (const f of (Array.isArray(findings) ? findings : [])) {
    if (f.severity === 'error') score -= 15;
    else if (f.severity === 'warning') score -= 7;
    else score -= 2;
  }
  return Math.max(0, Math.min(100, score));
}

// ─── Request Handler ─────────────────────────────────────────────────────

export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json', ...CORS_HEADERS };

  try {
    const { fdText, mode = 'full' } = await context.request.json();

    if (!fdText || fdText.trim().length < 10) {
      return new Response(JSON.stringify({ error: 'Missing or too short FD text' }), {
        status: 400, headers,
      });
    }

    if (!context.env.AI) {
      return new Response(JSON.stringify({ error: 'Workers AI binding not configured.' }), {
        status: 503, headers,
      });
    }

    const cost = mode === 'scoped' ? 1 : 3;
    const rateInfo = await checkRateLimit(context, cost);

    if (!rateInfo.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        message: `Review costs ${cost} credit${cost > 1 ? 's' : ''}. ${rateInfo.remaining}/${rateInfo.limit} remaining.`,
        remaining: rateInfo.remaining,
        limit: rateInfo.limit,
        needed: cost,
      }), { status: 429, headers });
    }

    let categories;

    if (mode === 'scoped') {
      // Single LLM call — scoped review of selected nodes
      const result = await runLLM(context.env.AI, SCOPED_REVIEW_PROMPT,
        `Review these FD nodes:\n\n${fdText}`);

      if (result && result.categories) {
        categories = result.categories.map(c => ({
          ...c,
          score: computeScore(c.findings || []),
        }));
      } else {
        // Fallback: wrap array as a single category
        categories = [{
          name: 'Review',
          icon: '📋',
          score: computeScore(Array.isArray(result) ? result : []),
          findings: Array.isArray(result) ? result : [],
        }];
      }
    } else {
      // Full doc review — 3 parallel calls
      const [naming, visual, structure] = await Promise.all([
        runLLM(context.env.AI, NAMING_PROMPT, `Analyze:\n\n${fdText}`),
        runLLM(context.env.AI, VISUAL_PROMPT, `Analyze:\n\n${fdText}`),
        runLLM(context.env.AI, STRUCTURE_PROMPT, `Analyze:\n\n${fdText}`),
      ]);

      categories = [
        { name: 'Naming', icon: '📝', score: computeScore(naming), findings: Array.isArray(naming) ? naming : [] },
        { name: 'Colors & Visuals', icon: '🎨', score: computeScore(visual), findings: Array.isArray(visual) ? visual : [] },
        { name: 'Structure & Layout', icon: '📐', score: computeScore(structure), findings: Array.isArray(structure) ? structure : [] },
      ];
    }

    const overallScore = Math.round(
      categories.reduce((s, c) => s + c.score, 0) / Math.max(categories.length, 1)
    );

    return new Response(JSON.stringify({
      score: overallScore,
      categories,
      totalFindings: categories.reduce((n, c) => n + (c.findings?.length || 0), 0),
      remaining: rateInfo.remaining,
      limit: rateInfo.limit,
      mode,
    }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Review failed' }), {
      status: 500, headers,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}
