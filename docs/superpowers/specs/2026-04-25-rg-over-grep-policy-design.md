# rg-over-grep Policy Design

## 1. Overview

The goal is to make agent behavior consistent when searching code and docs:

1. prefer the host-native content-search tool for agent-driven searches
2. when a shell search is necessary, use `rg` instead of `grep`
3. avoid hard blocking, runtime wrappers, or CI enforcement for now

This is intentionally a **policy-only** change. The rule should live in the shared canonical agent policy so it propagates through the existing render pipeline instead of being restated separately in `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.

## 2. Problem Statement

Current guidance is inconsistent:

- some workflow and docs surfaces already prefer `rg`
- the shared canonical policy does not state a repo-wide search preference
- some older examples still use shell `grep`

That leaves agents free to drift between:

- host-native search tools
- shell `rg`
- shell `grep`

The result is avoidable inconsistency in prompts, workflows, and live tool use.

## 3. Goals

- Add one clear search-policy rule in the shared canonical source.
- Preserve the existing preference order: host-native search tool first, shell fallback second.
- Make `rg` the default shell content-search command.
- Keep the wording compatible with the current surface renderer and host-neutral lint.
- Let the rule flow automatically into generated agent surfaces.

## 4. Non-Goals

- No runtime blocking of shell `grep`.
- No new CI/lint/checker that fails builds for `grep` usage.
- No large-scale cleanup of every historical `grep` example in one pass.
- No change to unrelated file-search guidance.

## 5. Chosen Approach

### 5.1 Source of truth

Add a new short subsection to `.agents/shared/canonical.md`.

Do **not** place this rule in `.agents/overrides/repo.md`, because the behavior is not repo-specific. Do **not** edit generated files directly.

The existing renderer already projects canonical content into:

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `zed-extensions/extensions/fast-draft/GEMINI.md`

### 5.2 Policy semantics

The rule should distinguish between agent-native tooling and shell commands:

1. **Agent-native content search**: prefer the host's native content-search tool.
2. **Shell content search**: use `rg`, not `grep`.
3. **Exception path**: only use shell `grep` when `rg` is unavailable or a specific environment constraint requires `grep`; when that happens, state the reason briefly.

This preserves the user's requested behavior without conflicting with the existing preference for native tools over shell commands.

### 5.3 Proposed canonical wording

Recommended text for `.agents/shared/canonical.md`:

```md
### Search tool hygiene

- Prefer the host-native content-search tool when searching file contents.
- When shell-based content search is necessary, use `rg` instead of `grep`.
- Use shell `grep` only when `rg` is unavailable or a specific environment constraint requires it, and state the reason briefly.
```

This wording stays host-neutral while still giving a concrete shell rule.

### 5.4 Why policy-only

The user explicitly chose prompt/policy enforcement instead of a checker or guardrail.

That choice fits the current repo architecture:

- the repo already has a canonical policy source
- generated surfaces already distribute shared rules well
- a new linter or runtime wrapper would add maintenance cost disproportionate to the problem

## 6. Alternatives Considered

### 6.1 Add a linter/checker

Pros:

- stronger enforcement
- easier to detect drift in edited docs or prompts

Cons:

- extra maintenance surface
- likely false positives for historical examples, third-party text, or legitimate exception cases
- not what the user selected

### 6.2 Add runtime blocking or wrapper logic

Pros:

- strongest enforcement

Cons:

- most brittle option
- difficult to apply cleanly across all agent hosts
- obscures intent instead of teaching the preferred behavior
- not what the user selected

### 6.3 Policy-only update in canonical source

Pros:

- matches user choice
- minimal change surface
- single source of truth
- no new moving parts

Cons:

- relies on prompt compliance rather than hard blocking
- old `grep` examples may remain until cleaned up later

This is the recommended approach.

## 7. Surface Impact

### Required

- `.agents/shared/canonical.md`
- rendered outputs via `npm run render:agent-surfaces`

### Not required for the first pass

- `.agents/overrides/repo.md`
- workflow docs
- historical plan files under `.sisyphus/`

### Optional follow-up cleanup

Update stale examples that still show shell `grep`, starting with the known `.sisyphus/plans/inline-edit-positioning.md` example and any future workflow snippets that conflict with the new policy.

## 8. Verification

After implementation, verify with the existing surface-render pipeline:

1. edit `.agents/shared/canonical.md`
2. run `npm run render:agent-surfaces`
3. run `npm run verify:agent-surfaces`
4. confirm the rendered guidance appears in:
   - `AGENTS.md`
   - `CLAUDE.md`
   - `GEMINI.md`
   - `zed-extensions/extensions/fast-draft/GEMINI.md` when present

No additional runtime or CI verification is required for this change.

## 9. Acceptance Criteria

- The shared canonical policy explicitly prefers native content-search tools first.
- The shared canonical policy explicitly says to use `rg` instead of shell `grep`.
- The policy defines a narrow exception path for shell `grep`.
- Rendered agent surfaces inherit the same rule through the existing renderer.
- No new checker, hook, or runtime guard is introduced.

## 10. Summary

This design adds a single shared policy rule, keeps enforcement lightweight, and uses the repo's existing canonical-to-generated surface pipeline. That gives the repo one clear answer:

- native content-search tool first
- `rg` for shell search
- shell `grep` only as an explicit exception
