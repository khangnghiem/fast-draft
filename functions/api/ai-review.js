/**
 * Cloudflare Pages Function — Design Review Agent endpoint.
 * Multi-step AI analysis of FD documents.
 *
 * Bindings required:
 *   - AI (Workers AI)
 *   - RATE_LIMIT (KV Namespace) — shared with /api/ai
 *
 * Each review consumes 3 AI calls (counts as 3 toward daily limit).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const DEFAULT_DAILY_LIMIT = 10;
const KV_TTL_SECONDS = 86400;
const REVIEW_COST = 3; // 3 LLM calls per review

// ─── Rate Limiting (shared logic with ai.js) ─────────────────────────────

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

const NAMING_PROMPT = `You are an FD (Fast Draft) code quality auditor. Analyze the naming quality of this FD document.

Check for:
1. Anonymous IDs (like @_rect_0, @_ellipse_1) — these should be semantic (@hero_card, @nav_menu)
2. Non-descriptive names — IDs should reveal intent, not just type
3. Inconsistent naming conventions — should all be snake_case
4. Missing IDs on important elements

Return ONLY a JSON array of findings. Each finding has:
- "severity": "error" | "warning" | "info"
- "message": short description of the issue
- "nodeId": the affected @id (if applicable)
- "suggestion": what to do instead

Example: [{"severity":"warning","message":"Anonymous ID @_rect_0 should be semantic","nodeId":"@_rect_0","suggestion":"Rename to @hero_card based on context"}]

If everything is perfect, return: []`;

const VISUAL_PROMPT = `You are a professional UI designer auditing an FD (Fast Draft) design document.

Analyze the visual design quality:
1. Color harmony — are fill/stroke colors from a cohesive palette or random?
2. Spacing consistency — are gaps/padding values consistent or arbitrary?
3. Contrast — would text be readable against its background color?
4. Corner radius — are border radii consistent across similar elements?
5. Typography — are font sizes following a clear hierarchy?

Return ONLY a JSON array of findings. Each finding has:
- "severity": "error" | "warning" | "info"
- "message": short description of the visual issue
- "nodeId": the affected @id (if applicable)
- "suggestion": what to improve

If everything is well-designed, return: []`;

const STRUCTURE_PROMPT = `You are an FD (Fast Draft) architecture auditor. Analyze document structure.

Check for:
1. Style reuse — are similar properties repeated inline instead of using style blocks?
2. Layout quality — are elements using absolute positions where constraints would be better?
3. Hierarchy — is the node tree well-organized (groups/frames for related elements)?
4. Accessibility — do interactive elements have sufficient size (min 44×44)?
5. Edge organization — are edges using edge_defaults for shared properties?

Return ONLY a JSON array of findings. Each finding has:
- "severity": "error" | "warning" | "info"
- "message": short description of the structural issue
- "suggestion": what to improve

If everything is well-structured, return: []`;

// ─── Multi-Step Review Pipeline ──────────────────────────────────────────

async function runReviewStep(ai, fdText, systemPrompt) {
  try {
    const result = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this FD document:\n\n${fdText}` },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    });

    const text = (result.response || '').trim();
    // Extract JSON array from response (handle markdown fences)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (err) {
    console.error('Review step error:', err);
    return [];
  }
}

function computeScore(findings) {
  // Start at 100, deduct per finding by severity
  let score = 100;
  for (const f of findings) {
    if (f.severity === 'error') score -= 15;
    else if (f.severity === 'warning') score -= 7;
    else score -= 2; // info
  }
  return Math.max(0, Math.min(100, score));
}

// ─── Request Handler ─────────────────────────────────────────────────────

export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json', ...CORS_HEADERS };

  try {
    // Rate limit check (costs 3 calls)
    const rateInfo = await checkRateLimit(context, REVIEW_COST);

    if (!rateInfo.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        message: `Design Review costs ${REVIEW_COST} credits. You have ${rateInfo.remaining} remaining (${rateInfo.limit}/day free).`,
        remaining: rateInfo.remaining,
        limit: rateInfo.limit,
        needed: REVIEW_COST,
      }), { status: 429, headers });
    }

    const { fdText } = await context.request.json();

    if (!fdText || fdText.trim().length < 10) {
      return new Response(JSON.stringify({ error: 'Missing or too short FD text' }), {
        status: 400,
        headers,
      });
    }

    if (!context.env.AI) {
      return new Response(JSON.stringify({
        error: 'Workers AI binding not configured.',
      }), { status: 503, headers });
    }

    // Run all 3 review steps in parallel
    const [namingFindings, visualFindings, structureFindings] = await Promise.all([
      runReviewStep(context.env.AI, fdText, NAMING_PROMPT),
      runReviewStep(context.env.AI, fdText, VISUAL_PROMPT),
      runReviewStep(context.env.AI, fdText, STRUCTURE_PROMPT),
    ]);

    const categories = [
      {
        name: 'Naming',
        icon: '📝',
        score: computeScore(namingFindings),
        findings: namingFindings,
      },
      {
        name: 'Colors & Visuals',
        icon: '🎨',
        score: computeScore(visualFindings),
        findings: visualFindings,
      },
      {
        name: 'Structure & Layout',
        icon: '📐',
        score: computeScore(structureFindings),
        findings: structureFindings,
      },
    ];

    const allFindings = [...namingFindings, ...visualFindings, ...structureFindings];
    const overallScore = Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length);

    return new Response(JSON.stringify({
      score: overallScore,
      categories,
      totalFindings: allFindings.length,
      remaining: rateInfo.remaining,
      limit: rateInfo.limit,
    }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Review failed' }), {
      status: 500,
      headers,
    });
  }
}

// Handle OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}
