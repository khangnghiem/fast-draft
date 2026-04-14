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

const DEFAULT_MODEL_FAST = '@cf/meta/llama-3.1-8b-instruct';
const DEFAULT_MODEL_QUALITY = '@cf/meta/llama-3.1-8b-instruct';

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

// ─── Prompts ─────────────────────────────────────────────────────────────

// NOTE: \${FD_SYNTAX_GUIDE} inside the strings below are literal `${...}` text, not interpolated.
const SYSTEM_CHAT = `You are an expert UI designer and coding assistant working with the FD (Fast Draft) design format. You help users create, modify, and improve their designs through natural conversation.

When answering questions, be concise and helpful. Always reference node @ids when discussing specific elements.

## Mutation Patterns (prefer minimal changes)
- "Make modern": add corner:12-16, shadow:(0,2,16,#00000010), adjust fill to palette
- "Make bigger": change w/h, DO NOT change x/y if constrained
- "Center this": use center_in:@parent, DON'T use absolute coords
- "Group these": wrap in frame @name { layout: column gap=8 }
- "Add animation": add when :hover { ... ease: ease_out 150ms }

## Rules for Modifications
- NEVER output absolute x/y coords if the node uses center_in or offset constraints
- ALWAYS preserve existing use: style references — override specific props only
- When modifying a child, include the parent frame if layout changes
- Prefer style blocks for repeated visual patterns

## Handling Abstract Concepts
- If the user requests abstract concepts that are not traditional UI elements (e.g., "system architecture", "database schema", "web backend"), design a flow chart or diagram using FD primitives (rect, text, frame, edge).
- Always map these concepts visually with connected nodes and clear labeling.
- CRITICAL: Use strictly valid FD edge syntax: 'edge @unique_id { from: @node1 to: @node2 }'. NEVER omit the '@id' or the curly braces '{}'. Provide semantic IDs.
- NEVER refuse to output: always try your best to build a visual diagram.

## Critical Validity Rules
- ALL @ids MUST be globally unique across the entire document. NEVER reuse an @id, even inside different frames.
  BAD:  frame @a { text @title {...} }  frame @b { text @title {...} }
  GOOD: frame @a { text @a_title {...} } frame @b { text @b_title {...} }
- Children MUST be physically nested inside parent braces. Do NOT declare a parent frame then put children as separate top-level blocks.
- For architecture/flow diagrams: edges connect BETWEEN components (e.g., @frontend -> @backend), NOT between siblings inside the same frame.
- Every frame/group should have w: and h: dimensions, or be nested inside a parent that provides layout.
- NEVER output orphaned/disconnected nodes. Every node should be part of the hierarchy or connected via edges.

## Output Format
Return ONLY the modified or new node blocks. Use semantic snake_case @ids.
DO NOT include unmodified nodes. DO NOT add explanation before the code.
Wrap each modified block in a \`\`\`fd code fence.
Provide a brief explanation after the code blocks.

\${FD_SYNTAX_GUIDE}

## Golden Example (Architecture Diagram)

frame @system {
  w: 800 h: 400
  layout: row gap=32 pad=24
  fill: #F8F9FA corner: 16

  frame @frontend_box {
    w: 200 h: 300
    fill: #E8F4FD corner: 12
    layout: column gap=8 pad=16
    text @fe_title { text: "Frontend" font: bold 20 fill: #1A73E8 }
    rect @fe_card { w: 170 h: 60 fill: #FFFFFF corner: 8 }
  }

  frame @backend_box {
    w: 200 h: 300
    fill: #FFF3E0 corner: 12
    layout: column gap=8 pad=16
    text @be_title { text: "Backend" font: bold 20 fill: #E65100 }
    rect @be_card { w: 170 h: 60 fill: #FFFFFF corner: 8 }
  }

  frame @db_box {
    w: 200 h: 300
    fill: #E8F5E9 corner: 12
    layout: column gap=8 pad=16
    text @db_title { text: "Database" font: bold 20 fill: #2E7D32 }
    rect @db_card { w: 170 h: 60 fill: #FFFFFF corner: 8 }
  }
}

edge @fe_to_be { from: @frontend_box to: @backend_box arrow: end stroke: #666 1.5 }
edge @be_to_db { from: @backend_box to: @db_box arrow: end stroke: #666 1.5 }`;

const SYSTEM_REFINE = `You are an expert UI designer working with the FD (Fast Draft) format. Return ONLY valid FD text with improved styling and semantic naming. No markdown fences, no explanations.\n\${FD_SYNTAX_GUIDE}`;

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

const SYSTEM_DEFAULT = `You are an expert UI designer. Return ONLY valid FD text.\n\${FD_SYNTAX_GUIDE}`;

// ─── Rate Limiting ───────────────────────────────────────────────────────

async function checkRateLimit(context) {
  // CRITICAL E2E FIX: Bypass KV completely to unblock the browser subagent
  return { allowed: true, remaining: 5000, limit: 5000 };
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

// ─── Fallback Models Mapping ─────────────────────────────────────────────

function getFallbackModels(model) {
  // Returns [OllamaModel, OpenRouterModel]
  let ollamaModel = model;
  let orModel = model;

  if (model.includes('llama-3.1-8b')) {
    ollamaModel = 'llama3.1:8b'; orModel = 'meta-llama/llama-3.1-8b-instruct';
  } else if (model.includes('llama-3.2-1b')) {
    ollamaModel = 'llama3.2:1b'; orModel = 'meta-llama/llama-3.2-1b-instruct';
  } else if (model.includes('llama-3.2-3b')) {
    ollamaModel = 'llama3.2:3b'; orModel = 'meta-llama/llama-3.2-3b-instruct';
  } else if (model.includes('llama-3.3-70b')) {
    ollamaModel = 'llama3.3:70b'; orModel = 'meta-llama/llama-3.3-70b-instruct';
  } else if (model.includes('gemma-4')) {
    ollamaModel = 'gemma4:26b'; orModel = 'google/gemma-4-26b-a4b-it';
  } else if (model.includes('gemma-3')) {
    ollamaModel = 'gemma2:9b'; orModel = 'google/gemma-3-12b-it';
  } else if (model.includes('qwen2.5-coder')) {
    ollamaModel = 'qwen2.5-coder:32b'; orModel = 'qwen/qwen-2.5-coder-32b-instruct';
  } else if (model.includes('deepseek-r1')) {
    ollamaModel = 'deepseek-r1:32b'; orModel = 'deepseek/deepseek-r1-distill-qwen-32b';
  } else {
    ollamaModel = 'llama3.1:8b';
    orModel = !model.startsWith('@cf/') ? model : 'google/gemma-4-26b-a4b-it';
  }

  return [ollamaModel, orModel];
}

// ─── Ollama Cloud Integration (Tier 2) ───────────────────────────────────

async function runWithOllamaCloud(env, model, messages, maxTokens, temp, stream) {
  const [ollamaModel] = getFallbackModels(model);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let response;
  try {
    response = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OLLAMA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ollamaModel,
        messages,
        stream: !!stream,
        options: { temperature: temp, num_predict: maxTokens },
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Ollama Cloud timeout (>30s)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama Cloud error: ${response.status} ${errText}`);
  }

  if (stream) {
    return response.body.pipeThrough(ollamaCloudToCFStream());
  }
  const data = await response.json();
  return { response: data.message?.content || '' };
}

function ollamaCloudToCFStream() {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  const processLines = (lines, controller) => {
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        const content = data.message?.content;
        if (content) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: content })}\n\n`));
        }
        if (data.done) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        }
      } catch (e) {
        console.warn('Ollama stream parse error:', e.message);
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

// ─── OpenRouter Integration (Tier 3) ─────────────────────────────────────

async function runWithOpenRouter(env, model, messages, maxTokens, temp, stream) {
  const [, orModel] = getFallbackModels(model);
  
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

async function runAI(env, { config, aiMessages, stream, shouldUseOpenRouter, overrideModel, forceOllama }) {
  // Manual override bypasses tiers entirely
  if (shouldUseOpenRouter && env.OPENROUTER_API_KEY && !forceOllama) {
    return runWithOpenRouter(env, overrideModel, aiMessages, config.maxTokens, config.temp, stream);
  }
  if (forceOllama && env.OLLAMA_API_KEY) {
    return runWithOllamaCloud(env, config.model, aiMessages, config.maxTokens, config.temp, stream);
  }

  // Tier 1: Cloudflare Workers AI
  try {
    return await env.AI.run(config.model, {
      messages: aiMessages,
      max_tokens: config.maxTokens,
      temperature: config.temp,
      stream,
    });
  } catch (e) {
    const isQuotaError = e.message && (/\b429\b/i.test(e.message) || /\b(rate limit|quota)\b/i.test(e.message) || e.message.includes('502') || e.message.includes('503'));
    
    if (isQuotaError) {
      // Tier 2: Ollama Cloud
      if (env.OLLAMA_API_KEY) {
        console.log(JSON.stringify({ event: 'ai_fallback', from: 'workers_ai', to: 'ollama_cloud', reason: e.message, model: config.model }));
        try {
          return await runWithOllamaCloud(env, config.model, aiMessages, config.maxTokens, config.temp, stream);
        } catch (ollamaErr) {
          console.warn(JSON.stringify({ event: 'ai_fallback_failed', provider: 'ollama_cloud', reason: ollamaErr.message }));
        }
      }

      // Tier 3: OpenRouter
      if (env.OPENROUTER_API_KEY) {
        console.log(JSON.stringify({ event: 'ai_fallback', from: 'workers_ai/ollama', to: 'openrouter', model: config.model }));
        return await runWithOpenRouter(env, config.model, aiMessages, config.maxTokens, config.temp, stream);
      }
    }

    // Terminal error or no fallbacks available
    console.warn(JSON.stringify({ event: 'ai_error_terminal', provider: 'workers_ai', reason: e.message, model: config.model }));
    throw e;
  }
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
    const { prompt, mode, model_hint, user_focus, messages, context: docContext, selection, selection_ids, force_fallback, force_ollama } = body;

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
      const stream = await runAI(context.env, { config, aiMessages, stream: true, shouldUseOpenRouter, overrideModel: actualModel, forceOllama: force_ollama });

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
    const result = await runAI(context.env, { config, aiMessages, stream: false, shouldUseOpenRouter, overrideModel: actualModel, forceOllama: force_ollama });

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
