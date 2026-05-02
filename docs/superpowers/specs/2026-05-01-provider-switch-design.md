# Provider Switch Design

**Date:** 2026-05-01  
**Status:** Draft  
**Scope:** `/provider` slash command in OpenCode + per-provider preset blocks in `oh-my-opencode-slim.json`

---

## Problem

`oh-my-opencode-slim.json` hardcodes a single mixed-provider config. When a specific provider is unavailable or preferred, there is no fast way to switch all agent models to that provider. The council councillors (alpha/beta/gamma) should always stay cross-provider for diverse perspectives.

---

## Goals

1. `/provider [name]` inside OpenCode switches all main agent models to a single designated provider.
2. Council councillors (alpha/beta/gamma) are unchanged — always cross-provider.
3. Fallback chains and `manualPlan` also use only the active provider's models.
4. Adding a new provider requires only adding a preset block — no script changes.

---

## Non-Goals

- Changing model IDs mid-session (change takes effect on OpenCode reload).
- Switching council councillors per provider.
- Automatic hot-reload of OpenCode config.

---

## Architecture

### Single-file preset approach

`oh-my-opencode-slim.json` already has a `preset` top-level key and a `presets` map. The design extends this: each provider gets its own named preset block. A script updates `preset`, `fallback.chains`, and `manualPlan` atomically.

```
oh-my-opencode-slim.json
├── preset: "github-copilot"          ← updated by /provider
├── presets:
│   ├── openai:         all agents → openai/* models
│   ├── github-copilot: all agents → github-copilot/* models
│   └── ollama-cloud:   all agents → ollama-cloud/* models
├── fallback:
│   └── chains: (per-provider set)    ← updated by /provider
├── manualPlan: (per-provider set)    ← updated by /provider
└── council:                          ← NEVER changed by /provider
    ├── timeout, councillor settings (unchanged)
    └── presets:
        ├── default:      alpha=deepseek, beta=kimi, gamma=glm
        └── hosted_only:  alpha=deepseek, beta=claude, gamma=codex
```

### What `/provider` changes vs keeps

| Section | Changed? |
|---|---|
| `preset` | ✅ updated to selected provider |
| `presets` | ❌ all preset definitions stay intact |
| `fallback.chains` | ✅ replaced with provider-specific chains |
| `manualPlan` | ✅ replaced with provider-specific plan |
| `council.*` | ❌ never touched |
| `websearch` | ❌ never touched |

---

## Model Assignments

### Per-role model choices

| Role | openai | github-copilot | ollama-cloud |
|---|---|---|---|
| orchestrator | openai/gpt-5.5 | github-copilot/claude-sonnet-4.6 | ollama-cloud/deepseek-v4-pro |
| oracle | openai/gpt-5.5 | github-copilot/claude-opus-4.7 | ollama-cloud/deepseek-v4-pro |
| designer | openai/gpt-5.5 | github-copilot/claude-opus-4.7 | ollama-cloud/kimi-k2.6 |
| fixer | openai/gpt-5.5 | github-copilot/gpt-5.3-codex | ollama-cloud/deepseek-v4-pro |
| librarian | openai/gpt-5-mini | github-copilot/gpt-5-mini | ollama-cloud/glm-5.1 |
| explorer | openai/gpt-5-mini | github-copilot/gpt-5-mini | ollama-cloud/glm-5.1 |
| council agent¹ | openai/gpt-5.5 | github-copilot/claude-opus-4.7 | ollama-cloud/deepseek-v4-pro |

¹ The council **orchestrator agent role** (which model runs the council agent), not the councillors.

### Fallback chains (within-provider)

**openai:**
- orchestrator: `gpt-5.5 → gpt-5-mini`
- oracle: `gpt-5.5 → gpt-5-mini`
- designer: `gpt-5.5 → gpt-5-mini`
- fixer: `gpt-5.5 → gpt-5-mini`
- librarian/explorer: `gpt-5-mini`

**github-copilot:**
- orchestrator: `claude-sonnet-4.6 → gpt-5.5 → gpt-5.4`
- oracle: `claude-opus-4.7 → gpt-5.5 → gpt-5.4`
- designer: `claude-opus-4.7 → gpt-5.5 → gpt-5.4`
- fixer: `gpt-5.3-codex → gpt-5.4 → gpt-5.5`
- librarian/explorer: `gpt-5-mini → gpt-5.4`

**ollama-cloud:**
- orchestrator: `deepseek-v4-pro → kimi-k2.6 → qwen3.5:397b`
- oracle: `deepseek-v4-pro → kimi-k2.6 → qwen3.5:397b`
- designer: `kimi-k2.6 → deepseek-v4-pro`
- fixer: `deepseek-v4-pro → kimi-k2.6`
- librarian/explorer: `glm-5.1 → gemma4:31b`

---

## `/provider` Slash Command

### Location
- Script: `~/.config/opencode/bin/provider-switch.mjs`
- OpenCode command definition: `~/.config/opencode/commands/provider.md`

### Behavior

```
/provider [openai|github-copilot|ollama-cloud]
```

- If no argument is given: agent presents the list and asks the user to choose.
- If argument is given: switches immediately.
- Validates that the named preset exists in `presets` before writing.
- Writes via temp file + atomic rename (never overwrites on partial failure).
- Reports: `"Switched to <provider>. Reload OpenCode to apply."`
- Takes effect on next OpenCode session load (not mid-session).

### Script algorithm

```
1. read oh-my-opencode-slim.json
2. validate provider arg is a key in config.presets
3. build updated top-level:
   - config.preset = provider
   - config.fallback.chains = PROVIDER_FALLBACK_MAP[provider]
   - config.manualPlan = PROVIDER_MANUAL_PLAN_MAP[provider]
4. JSON.stringify with 2-space indent
5. write to tmpfile
6. validate JSON round-trip
7. rename tmpfile → oh-my-opencode-slim.json
8. log "Switched to <provider>."
```

The fallback and manualPlan maps are embedded in the script as constants (one object per provider). This avoids the config file needing to encode them redundantly.

### OpenCode command definition

`~/.config/opencode/commands/provider.md` wraps the script with a brief description so it appears as a `/provider` slash command when invoked in the OpenCode chat.

---

## Extensibility

To add a new provider (e.g., `anthropic`):

1. Add `"anthropic": { ... }` preset block to `oh-my-opencode-slim.json`
2. Add `PROVIDER_FALLBACK_MAP.anthropic` and `PROVIDER_MANUAL_PLAN_MAP.anthropic` constants to `provider-switch.mjs`
3. Done — script auto-discovers available providers from `config.presets` keys

---

## Error Handling

| Error | Behavior |
|---|---|
| Unknown provider name | Print available providers, exit with error, do not write |
| `config.presets[provider]` missing | Same |
| Write fails mid-way | Temp file left behind, canonical file untouched |
| Invalid JSON result | Do not rename, log error |

---

## Testing

- Unit: run `provider-switch.mjs github-copilot` on a fixture JSON, assert `preset === "github-copilot"`, `fallback.chains` and `manualPlan` updated, `council` unchanged.
- Manual: run `/provider openai` in OpenCode, confirm model IDs in chat header on reload.
- Edge: pass unknown provider name, confirm no file change.

---

## Acceptance Criteria

- [ ] `/provider github-copilot` sets `preset` to `github-copilot` and all agents use `github-copilot/*` models.
- [ ] Council alpha/beta/gamma are identical before and after any `/provider` call.
- [ ] `/provider unknown` prints an error and leaves the file unchanged.
- [ ] Write failure leaves the original file intact.
- [ ] Adding a new preset block + script constant is the only change needed to support a new provider.
