# AI Design Agent Spec (R4.26)

## 1. Overview
The Fast Draft AI Design Agent is a multi-turn, context-aware co-pilot tailored specifically for the `.fd` file format. Unlike generic LLMs that rely on visual mockups, our agent interacts natively with the document's DSL (SceneGraph constraints, styles, metadata), enabling bidirectional "vibe coding" inside the canvas.

## 2. Context Engineering Pipeline

The most critical aspect of the AI design workflow is what is sent to the model:

- **User Prompt:** The raw instructions typed by the user (e.g., "Add a stylish header").
- **Selected Component Focus:** If nodes are selected on the canvas, their source code is deeply inspected. The agent receives `emit_selection_fd()` payload.
- **Global Constraints & Sandbox:** The system prompt restricts changes to affect *only* the current tree or the selected children unless explicitly instructed otherwise.
- **Project Styles:** Existing `theme` definitions and color constants used throughout the specific document.

## 3. Architecture (Two-Phase Evolution)

The system is delivered in two phases to optimize time-to-market while retaining an upgrade path for deeper agentic behaviors.

### Phase 1: Edge Computing Frontend (Current)
The backend operates entirely on **Cloudflare Pages Functions** (`functions/api/ai.js`) powered by **Workers AI**.
- **No-Cost Operation:** Leverages the free 10,000 Neurons/day allowance.
- **Model Diversity:** Supports 18+ models including Llama 8B/70B, Gemma, Qwen, and DeepSeek.
- **Direct SSE:** Transforms standard Workers AI streaming directly into frontend-consumable Server-Sent Events.

### Phase 2: 3-Tier Fallback (Current)
A resilient fallback chain ensures AI availability when any single provider is down or rate-limited:
- **Tier 1:** Cloudflare Workers AI (free Neurons allocation).
- **Tier 2:** Ollama Cloud — triggered on 429/502/503 from Tier 1.
- **Tier 3:** OpenRouter — final fallback with broad model coverage.
- Client-side `force_fallback` and `force_ollama` flags allow manual tier override.

## 4. Streaming SSE & Frontend Integration

We use standard `fetch` with `TextDecoder` to parse the Server-Sent Events (SSE) arriving from the Cloudflare API. 

### Data Protocol (SSE)
```json
// Event Format (Workers AI standard)
data: {"response": "Sure, I will adjust the padding..."}
```

### UI Behavior
- **Elevated Cursor-style Input:** Matches the "Agent" tab. Includes a model selector (e.g., Llama 3B, 8B, 70B), context pin indicator ("📌 @login_box"), and a minimalist text input area.
- **Progressive Rendering:** The markdown is rendered and updated fluidly during the stream.
- **Smart Apply/Skip Buttons:** When the agent emits a modified block of FD code, an inline viewer emerges. Clicking "Apply" performs an in-place document replacement.

## 5. Security & Rate Limiting
- **Rate Limiting:** IP-based tracking managed via Cloudflare KV namespace at the gateway level.
- **Daily Quotas:** Enforces the `AI_DAILY_LIMIT` constraint (default: 20 invocations per user per day).
- **Graceful Fallbacks:** If limits are exceeded, descriptive HTTP 429 errors are returned.
