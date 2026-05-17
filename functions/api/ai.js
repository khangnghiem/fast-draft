/**
 * Cloudflare Pages Function — Single AI endpoint for FD web editor.
 * Handles all AI modes: refine, review, chat.
 *
 * Bindings required:
 *   - AI (Workers AI)
 *   - RATE_LIMIT (KV Namespace)
 *
 * Environment variables:
 *   - AI_DAILY_LIMIT: max calls/day/IP (default: 20)
 *   - AI_MODEL_FAST: model for refine/chat (default: gemma-4-26b-a4b-it)
 *   - AI_MODEL_QUALITY: model for review (default: gemma-4-26b-a4b-it)
 */

const DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'X-RateLimit-Limit, X-RateLimit-Remaining',
};

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  let allowedOrigin = 'https://fast-draft.com'; // Default safe origin

  if (origin) {
    if (origin === 'https://fast-draft.com' || origin.startsWith('vscode-webview://')) {
      allowedOrigin = origin;
    }
  }

  return {
    ...DEFAULT_CORS_HEADERS,
    'Access-Control-Allow-Origin': allowedOrigin,
    'Vary': 'Origin',
  };
}

const DEFAULT_DAILY_LIMIT = 500; // Temporary bump for E2E testing
const KV_TTL_SECONDS = 86400;

// ─── Default Models (override via env vars) ──────────────────────────────

const DEFAULT_MODEL_FAST = '@cf/google/gemma-4-26b-a4b-it';
const DEFAULT_MODEL_QUALITY = '@cf/google/gemma-4-26b-a4b-it';

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
  'gemma-4':        '@cf/google/gemma-4-26b-a4b-it',
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

// ─── FD Syntax Guide (comprehensive + golden examples) ──────────────────

const FD_SYNTAX_GUIDE = `
## FD Syntax Reference

### Nodes
Types: rect | ellipse | text | frame | group | path | image | edge
Declaration: type @semantic_id { properties }

### Text Nodes (CRITICAL — follow exactly)
text @label { text: "Hello World" font: "Inter" bold 18 fill: #1A1A2E }
- The text CONTENT goes inside the \`text:\` property, NOT after the @id.
- WRONG: text @label "Hello" { }
- RIGHT: text @label { text: "Hello" }

### Properties
fill: #HEX        stroke: #HEX N    corner: N        opacity: 0-1
w: N              h: N              shadow: (0,2,16,#00000010)
font: "Family" weight Npx           (weight = bold|semibold|regular)

### Layout (PREFER over absolute positioning)
layout: column gap=N pad=N     layout: row gap=N pad=N
- Children inside a frame with layout are auto-arranged.
- ALWAYS use layout frames to group related elements.
- AVOID absolute x/y coordinates. Let the layout engine handle positioning.

### Constraints
center_in: @parent    place: center | top_left    offset: @ref dx dy

### Styles (DRY — define once, reuse)
style card_style { fill: #FFFFFF corner: 14 shadow: (0,2,12,#00000008) }
Then: rect @card { use: card_style w: 200 h: 120 }

### Edges (for diagrams/flows)
edge @id { from: @node1 to: @node2 arrow: end stroke: #666 1.5 }

### Hover Animation
when :hover { fill: #HEX ease: ease_out 150ms }
when :hover { scale: 1.02 ease: spring 200ms }
`;

// ─── Prompts ─────────────────────────────────────────────────────────────

const SYSTEM_CHAT = `You are an expert visual designer working with the FD (Fast Draft) design format. Create beautiful, well-structured designs.

## CRITICAL RULES (must follow)

1. **Text Content**: EVERY text node MUST have a \`text: "..."\` property with non-empty content. Use \`text @id { text: "content" }\` — NEVER \`text @id "content" { }\` and NEVER \`text @id { font: ... }\` without text:.
2. **Layout First**: ALWAYS wrap related elements in a \`frame\` with \`layout: column\` or \`layout: row\`. NO loose top-level nodes with absolute x/y.
3. **Unique IDs**: ALL @ids MUST be globally unique. Prefix with context: @login_title, @login_email, @login_btn.
4. **Nesting**: Children MUST be inside parent braces. Never declare children as separate top-level blocks.
5. **Dimensions**: Give every frame/rect explicit w: and h: values.
6. **Colors**: Use curated palettes, not raw primary colors. No #FF0000 or #0000FF.
7. **Style Blocks**: Define reusable styles for repeated patterns.

## Design Quality Standards
- Use corner: 12-16 for modern rounded corners
- Add shadow: (0,2,16,#00000010) for depth and elevation
- Use harmonious color palettes (blues: #3B82F6/#1E40AF, purples: #6C5CE7/#5A4BD1, greens: #10B981/#059669)
- Text hierarchy: title 24px bold, subtitle 16px semibold, body 14px regular, caption 12px
- Add hover animations for interactive elements
- Consistent padding (pad=16 or pad=24) and gaps (gap=8 or gap=12)

## Output Format
- Wrap all FD code in \\\`\\\`\\\`fd code fences
- Return ONLY the new/modified nodes — DO NOT repeat unmodified nodes
- Provide a brief explanation AFTER the code block
- For new designs, wrap everything in a root frame with layout

` + FD_SYNTAX_GUIDE + `

## Golden Examples

### Login Form
\\\`\\\`\\\`fd
style input_field { fill: #F3F4F6 corner: 8 }

frame @login_form {
  w: 340 h: 400
  fill: #FFFFFF corner: 16
  shadow: (0,4,24,#00000012)
  layout: column gap=16 pad=32

  text @login_title { text: "Welcome Back" font: "Inter" bold 28 fill: #1A1A2E }
  text @login_subtitle { text: "Sign in to your account" font: "Inter" regular 14 fill: #9CA3AF }

  frame @login_fields {
    w: 280 h: 120
    layout: column gap=12
    rect @email_field { w: 280 h: 48 use: input_field }
    text @email_label { text: "Email" font: "Inter" regular 13 fill: #6B7280 }
    rect @password_field { w: 280 h: 48 use: input_field }
    text @password_label { text: "Password" font: "Inter" regular 13 fill: #6B7280 }
  }

  rect @login_btn {
    w: 280 h: 48
    fill: #6C5CE7 corner: 10
    when :hover { fill: #5A4BD1 ease: ease_out 150ms }
  }
  text @login_btn_text { text: "Sign In" font: "Inter" semibold 16 fill: #FFFFFF }
}
\\\`\\\`\\\`

### Dashboard with Stat Cards
\\\`\\\`\\\`fd
style stat_card { fill: #FFFFFF corner: 14 shadow: (0,2,12,#00000008) }

frame @dashboard {
  w: 700 h: 200
  layout: row gap=20 pad=24
  fill: #F8FAFC corner: 16

  frame @card_revenue {
    w: 200 h: 140
    use: stat_card
    layout: column gap=4 pad=20
    text @rev_label { text: "Revenue" font: "Inter" regular 13 fill: #6B7280 }
    text @rev_value { text: "$24,500" font: "Inter" bold 28 fill: #1A1A2E }
    text @rev_change { text: "+12.5%" font: "Inter" semibold 14 fill: #10B981 }
  }

  frame @card_users {
    w: 200 h: 140
    use: stat_card
    layout: column gap=4 pad=20
    text @users_label { text: "Users" font: "Inter" regular 13 fill: #6B7280 }
    text @users_value { text: "1,240" font: "Inter" bold 28 fill: #1A1A2E }
    text @users_change { text: "+8.2%" font: "Inter" semibold 14 fill: #10B981 }
  }

  frame @card_orders {
    w: 200 h: 140
    use: stat_card
    layout: column gap=4 pad=20
    text @orders_label { text: "Orders" font: "Inter" regular 13 fill: #6B7280 }
    text @orders_value { text: "356" font: "Inter" bold 28 fill: #1A1A2E }
    text @orders_change { text: "-2.1%" font: "Inter" semibold 14 fill: #EF4444 }
  }
}
\\\`\\\`\\\`

### Architecture Diagram
\\\`\\\`\\\`fd
frame @system {
  w: 800 h: 400
  layout: row gap=32 pad=24
  fill: #F8F9FA corner: 16

  frame @frontend_box {
    w: 200 h: 300
    fill: #E8F4FD corner: 12
    layout: column gap=8 pad=16
    text @fe_title { text: "Frontend" font: "Inter" bold 20 fill: #1A73E8 }
    rect @fe_react { w: 170 h: 44 fill: #FFFFFF corner: 8 }
    text @fe_react_label { text: "React App" font: "Inter" regular 13 fill: #374151 }
  }

  frame @backend_box {
    w: 200 h: 300
    fill: #FFF3E0 corner: 12
    layout: column gap=8 pad=16
    text @be_title { text: "Backend" font: "Inter" bold 20 fill: #E65100 }
    rect @be_api { w: 170 h: 44 fill: #FFFFFF corner: 8 }
    text @be_api_label { text: "REST API" font: "Inter" regular 13 fill: #374151 }
  }

  frame @db_box {
    w: 200 h: 300
    fill: #E8F5E9 corner: 12
    layout: column gap=8 pad=16
    text @db_title { text: "Database" font: "Inter" bold 20 fill: #2E7D32 }
    rect @db_pg { w: 170 h: 44 fill: #FFFFFF corner: 8 }
    text @db_pg_label { text: "PostgreSQL" font: "Inter" regular 13 fill: #374151 }
  }
}

edge @fe_to_be { from: @frontend_box to: @backend_box arrow: end stroke: #94A3B8 1.5 }
edge @be_to_db { from: @backend_box to: @db_box arrow: end stroke: #94A3B8 1.5 }
\\\`\\\`\\\`

## Handling Abstract Concepts
If the user requests non-UI concepts (architecture, workflows, databases), create visual diagrams using rect/text/frame/edge. NEVER refuse — always produce a visual mapping.

## Modification Rules
- NEVER output absolute x/y coords if the node uses center_in or offset constraints
- ALWAYS preserve existing use: style references — override specific props only
- When modifying a child, include the parent frame if layout changes`;

const SYSTEM_REFINE = `You are an expert UI designer working with the FD (Fast Draft) format. Return ONLY valid FD text with improved styling and semantic naming. No markdown fences, no explanations.\n` + FD_SYNTAX_GUIDE;

const SYSTEM_REVIEW = `You are a professional design auditor for FD (Fast Draft) documents. Analyze the given FD text and return a JSON object with this exact structure:
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

Return ONLY valid JSON. No markdown fences, no explanations. Empty findings array if perfect.`;

const SYSTEM_DEFAULT = `You are an expert UI designer. Return ONLY valid FD text.\n` + FD_SYNTAX_GUIDE;

// ─── Rate Limiting ───────────────────────────────────────────────────────

async function checkRateLimit(context) {
  const kv = context.env.RATE_LIMIT;
  // Check for actual KV binding (has .get method), not just a truthy env var string
  if (!kv || typeof kv.get !== 'function' || context.env.DISABLE_RATE_LIMIT) return { allowed: true, remaining: -1, limit: -1 };

  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  const today = new Date().toISOString().slice(0, 10);
  const key = `ai:${ip}:${today}`;
  const limit = parseInt(context.env.AI_DAILY_LIMIT || "50", 10);

  const current = parseInt(await kv.get(key) || '0', 10);

  if (current >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  await kv.put(key, String(current + 1), { expirationTtl: 86400 });
  return { allowed: true, remaining: limit - (current + 1), limit };
}

// ─── Model + Prompt Selection ────────────────────────────────────────────

function getModelConfig(mode, env) {
  const fastModel = env.AI_MODEL_FAST || DEFAULT_MODEL_FAST;
  const qualityModel = env.AI_MODEL_QUALITY || DEFAULT_MODEL_QUALITY;

  switch (mode) {
    case 'chat':
      return { model: fastModel, system: SYSTEM_CHAT, maxTokens: 4096, temp: 0.4, isChat: true };
    case 'refine':
      return { model: fastModel, system: SYSTEM_REFINE, maxTokens: 4096, temp: 0.4 };
    case 'review':
      return { model: qualityModel, system: SYSTEM_REVIEW, maxTokens: 4096, temp: 0.2 };
    default:
      return { model: fastModel, system: SYSTEM_DEFAULT, maxTokens: 4096, temp: 0.3 };
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

// ─── MiniMax Integration (Tier 2) ────────────────────────────────────────

async function runWithMiniMax(env, model, messages, maxTokens, temp, stream) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let response;
  try {
    response = await fetch('https://api.minimax.io/v1/text/chatcompletion_v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.MINIMAX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.startsWith('@cf/') ? 'MiniMax-M2.7' : model,
        messages,
        stream: !!stream,
        temperature: temp,
        max_tokens: maxTokens,
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`MiniMax timeout (>30s)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`MiniMax error: ${response.status} ${errText}`);
  }

  if (stream) {
    return response.body.pipeThrough(miniMaxToCFStream());
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return { response: content };
}

function miniMaxToCFStream() {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  const processLines = (lines, controller) => {
    for (let line of lines) {
      if (line.startsWith('data: ')) {
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          continue;
        }
        try {
          const data = JSON.parse(payload);
          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: content })}\n\n`));
          }
        } catch (e) {
          console.warn('MiniMax stream parse error:', e.message);
        }
      }
    }
  };

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      processLines(lines, controller);
    },
    flush(controller) {
      if (buffer.trim()) {
        processLines([buffer], controller);
      }
    }
  });
}

// ─── OpenRouter Model Mapping ─────────────────────────────────────────────

function cfToOpenRouterModel(model) {
  // Map CF model format (@cf/provider/model) to OpenRouter format (provider/model)
  if (model.startsWith('@cf/')) {
    return model.slice(4); // Remove '@cf/' prefix
  }
  // For aliases like 'gemma-4', look up in MODEL_ALIASES first
  return model;
}

// ─── OpenRouter Integration (Tier 3) ─────────────────────────────────────

async function runWithOpenRouter(env, model, messages, maxTokens, temp, stream) {
  const orModel = cfToOpenRouterModel(model);
  
  const payload = {
    model: orModel,
    messages,
    max_tokens: maxTokens,
    temperature: temp,
    stream: !!stream
  };
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://fast-draft.com',
      'X-Title': 'Fast-Draft AI Gateway'
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${errText}`);
  }
  
  if (stream) {
    return response.body.pipeThrough(openRouterToCFStream());
  } else {
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenRouter returned empty response');
    return { response: content };
  }
}

function openRouterToCFStream() {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  const processLines = (lines, controller) => {
    for (let line of lines) {
      if (line.startsWith('data: ')) {
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            continue;
        }
        try {
            const data = JSON.parse(payload);
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              const cfPayload = JSON.stringify({ response: content });
              controller.enqueue(encoder.encode(`data: ${cfPayload}\n\n`));
            }
        } catch(e) {
            console.warn('stream chunk parse error:', e.message);
        }
      }
    }
  };

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      let lines = buffer.split('\n');
      buffer = lines.pop() || ''; 
      processLines(lines, controller);
    },
    flush(controller) {
      if (buffer.trim()) {
        processLines([buffer], controller);
      }
    }
  });
}

// ─── Unified AI Runner (3-Tier Fallback) ─────────────────────────────────

async function runAI(env, { config, aiMessages, stream, shouldUseOpenRouter, overrideModel }) {
  // Manual override bypasses tiers entirely
  if (shouldUseOpenRouter && env.OPENROUTER_API_KEY) {
    return runWithOpenRouter(env, overrideModel, aiMessages, config.maxTokens, config.temp, stream);
  }

  // Tier 1: Cloudflare Workers AI (skip if binding not available)
  const hasWorkersAI = env.AI && typeof env.AI.run === 'function';
  if (hasWorkersAI) {
    try {
      const result = await env.AI.run(config.model, {
        messages: aiMessages,
        max_tokens: config.maxTokens,
        temperature: config.temp,
        stream,
      });

      // For non-streaming: check if Workers AI returned empty content
      // (happens under load or when model is warming up)
      if (!stream) {
        const content = result?.response || '';
        if (!content.trim()) {
          console.log(JSON.stringify({ event: 'ai_fallback', from: 'workers_ai', reason: 'empty_response', model: config.model }));
          // Fall through to MiniMax/OpenRouter
        } else {
          return result;
        }
      } else {
        return result;
      }
    } catch (e) {
      const isQuotaError = e.message && (/\b429\b/i.test(e.message) || /\b(rate limit|quota)\b/i.test(e.message));
      const isTransientError = e.message && (e.message.includes('502') || e.message.includes('503'));
      
      // Only fall through to fallbacks for recoverable errors
      if (!isQuotaError && !isTransientError) {
        console.warn(JSON.stringify({ event: 'ai_error_terminal', provider: 'workers_ai', reason: e.message, model: config.model }));
        throw e;
      }
      console.log(JSON.stringify({ event: 'ai_fallback', from: 'workers_ai', reason: e.message, model: config.model }));
    }
  } else {
    console.log(JSON.stringify({ event: 'ai_skip_workers', reason: 'no_binding', model: config.model }));
  }

  // Tier 2: MiniMax
  if (env.MINIMAX_API_KEY) {
    try {
      return await runWithMiniMax(env, overrideModel || config.model, aiMessages, config.maxTokens, config.temp, stream);
    } catch (miniMaxErr) {
      console.warn(JSON.stringify({ event: 'ai_fallback_failed', provider: 'minimax', reason: miniMaxErr.message }));
    }
  }

  // Tier 3: OpenRouter
  if (env.OPENROUTER_API_KEY) {
    console.log(JSON.stringify({ event: 'ai_fallback', from: 'minimax', to: 'openrouter', model: config.model }));
    return await runWithOpenRouter(env, overrideModel || config.model, aiMessages, config.maxTokens, config.temp, stream);
  }

  throw new Error('All AI providers exhausted — no response available');
}

// ─── Request Handler ──────────────────────────────────────────────

export async function onRequestPost(context) {
  const headers = {
    'Content-Type': 'application/json',
    ...getCorsHeaders(context.request),
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
    const { prompt, mode, model_hint, user_focus, messages, context: docContext, selection, selection_ids, force_fallback } = body;

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

    // Allow operation if we have Workers AI OR any fallback provider
    const hasAI = !!context.env.AI && typeof context.env.AI.run === 'function';
    const hasMiniMax = !!context.env.MINIMAX_API_KEY;
    const hasOpenRouter = !!context.env.OPENROUTER_API_KEY;
    if (!hasAI && !hasMiniMax && !hasOpenRouter) {
      return new Response(JSON.stringify({
        error: 'No AI provider configured. Need Workers AI binding, MINIMAX_API_KEY, or OPENROUTER_API_KEY.',
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
      if (docContext) {
        if (typeof docContext === 'string') {
          systemPrompt += `\n\n## Current Document\n\`\`\`fd\n${docContext.slice(0, 8000)}\n\`\`\``;
        } else if (typeof docContext === 'object') {
          if (docContext.styles && docContext.styles.trim()) {
            systemPrompt += `\n\n## Design System (Styles)\n\`\`\`fd\n${docContext.styles}\n\`\`\``;
          }
          if (docContext.structure && docContext.structure.trim()) {
            systemPrompt += `\n\n## Document Structure\n\`\`\`fd\n${docContext.structure}\n\`\`\``;
          }
        }
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

    // ─── Routing Logic (OpenRouter vs CF Edge) ─────────────────
    const wantsStream = config.isChat && body.stream === true;

    let shouldUseOpenRouter = false;
    let actualModel = model_hint || config.model;

    if (force_fallback && context.env.OPENROUTER_API_KEY) {
      shouldUseOpenRouter = true;
      console.log(JSON.stringify({ event: 'ai_fallback_forced', from: 'client', to: 'openrouter', model: actualModel }));
    }

    if (wantsStream) {
      const stream = await runAI(context.env, { config, aiMessages, stream: true, shouldUseOpenRouter, overrideModel: actualModel });

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
    const result = await runAI(context.env, { config, aiMessages, stream: false, shouldUseOpenRouter, overrideModel: actualModel });

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
  return new Response(null, { headers: getCorsHeaders(context.request) });
}
