/**
 * Cloudflare Pages Function — AI endpoint for FD playground.
 * Uses Cloudflare Workers AI (free tier: 10,000 neurons/day).
 *
 * Binding required: AI (Workers AI) — configure in Cloudflare Dashboard:
 * Pages → fast-draft → Settings → Functions → Bindings → Workers AI → Variable: AI
 */

export async function onRequestPost(context) {
  // CORS headers for cross-origin requests
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { prompt, mode } = await context.request.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Missing prompt' }), {
        status: 400,
        headers,
      });
    }

    // Check if AI binding is available
    if (!context.env.AI) {
      return new Response(JSON.stringify({
        error: 'Workers AI binding not configured. Add AI binding in Cloudflare Dashboard → Pages → Settings → Functions.',
      }), { status: 503, headers });
    }

    const systemPrompt = mode === 'renamify'
      ? 'You are a UI naming expert. Return ONLY a valid JSON object mapping old node IDs to new semantic names. No markdown, no explanation.'
      : 'You are an expert UI designer working with the FD (Fast Draft) format. Return ONLY valid FD text. No markdown fences, no explanations.';

    const result = await context.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    });

    return new Response(JSON.stringify({ result: result.response }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'AI request failed' }), {
      status: 500,
      headers,
    });
  }
}

// Handle OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
