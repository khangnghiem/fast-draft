# OpenCode ↔ Claude Code Parity Design

## 1. Overview
The goal is to make OpenCode feel as close as possible to Claude Code, with the priority order:

1. prompt parity
2. behavior parity
3. workflow parity
4. UX parity

The intended shape is **hybrid**: a shared global baseline for as much as possible, plus narrow repo-specific overrides for true local exceptions.

## 2. Target Architecture

Use **3 layers**, not 4:

### 2.1 Canonical spec
One neutral source of truth for agent experience.

It defines:
- default policy
- behavior rules
- skill/workflow definitions
- output style
- tool-agnostic action names

This also acts as the effective global baseline. OpenCode and Claude both consume projections of the same source.

### 2.2 Tool adapters
Generated or near-generated projections for each surface:
- OpenCode global config under `~/.config/opencode/...`
- repo `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- workflow docs that embed host-specific instructions

Adapters should contain only host syntax, mappings, and minimal wrapper text.

### 2.3 Repo overrides
Hand-written local exceptions only:
- build/test commands
- package-manager rules
- architecture gotchas
- browser/E2E specifics

In `fast-draft`, that means shared agent behavior moves up, while project facts stay local.

## 3. Physical Layout and Ownership

The canonical source should live in the existing synced OpenCode config repo rather than in `fast-draft`.

### 3.1 Global canonical source
Recommended home:
- `experience/core.md` — core agent rules, tone, delegation, verification, output style
- `experience/workflows/*.md` — shared workflow definitions
- `experience/skills.md` — logical skill inventory and expectations
- `experience/tool-maps/{opencode,claude,gemini}.json` — host-specific mappings
- `scripts/render-experience.*` — generator for host projections

### 3.2 Generated/runtime surfaces
These are projections, not source of truth:
- `~/.config/opencode/opencode.json`
- related OpenCode config files
- rendered Claude projections
- repo-facing `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`

### 3.3 Repo-local overrides
Keep only project facts in repo-local override files:
- build/test commands
- package-manager rules
- architecture gotchas
- local workflow deltas
- browser/E2E specifics

For `fast-draft`, a small override file under `.agents/overrides/` is a good fit.

## 4. Composition and Precedence

Instruction order:

1. **User instruction**
   - always wins

2. **Repo override**
   - adds only project-local rules
   - must stay narrow and explicit

3. **Host adapter**
   - converts the canonical spec into Claude/OpenCode/Gemini syntax
   - may change expression, not policy

4. **Canonical spec**
   - default behavior and shared workflows
   - source of parity

### 4.1 Render flow
For each surface, generate:
- host wrapper
- shared rendered core
- repo-local appendix

So `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` all share the same structure with different wrappers.

### 4.2 Drift controls
- adapters cannot invent policy
- repo overrides cannot restate shared policy unless intentionally overriding it
- generated files include source path, generated hash/timestamp, and a `DO NOT EDIT` notice
- duplicate surfaces like `zed-extensions/.../GEMINI.md` must use the same render path

## 5. Verification and Drift Control

Prompt parity will drift unless it is checked automatically.

### 5.1 Required checks
- **Render idempotency**: regenerate all derived files and fail if `git diff` is non-empty
- **Canonical-spec lint**: forbid host-specific tool names in the canonical source (`Bash`, `TodoWrite`, etc.)
- **Override audit**: report repo override content beyond the shared rendered core

### 5.2 Behavioral parity checks
After prompt parity is in place, run a small fixed prompt suite against both Claude Code and OpenCode:
- plan a multi-step feature
- fix a bug
- review a PR
- run smoke checks
- ask for clarification on an ambiguous request

Compare behavior, not prose:
- did it invoke the right skill?
- did it ask before committing?
- did it verify before claiming success?
- did it choose similar tool and delegation patterns?

### 5.3 Constraints
- no giant framework
- no complex schema system
- no attempt to prove identical wording across hosts

Goal: same operating style, not byte-for-byte output parity.

## 6. Rollout Order

1. Extract the canonical spec from current agent docs and workflow files.
2. Build the OpenCode global adapter first.
3. Add the Claude adapter and fix divergences in the spec, not the adapters.
4. Add repo adapters for `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.
5. Add workflow adapters, starting with the highest-drift files.
6. Add idempotency and logical-name lint checks.
7. Add the behavioral parity smoke harness after the spec and adapters are stable.

## 7. Summary
The design keeps the canonical spec as the real source of truth, treats host files as generated projections, and limits repo-local files to genuine project exceptions. That gives the best shot at OpenCode feeling like Claude Code without turning the system into a large meta-framework.
