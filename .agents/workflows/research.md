---
description: Research a topic, gather facts, and produce prioritized suggestions.
---

// turbo-all

# /research

$ARGUMENTS

If `$ARGUMENTS` is provided, scope research to that topic (e.g., `/research caching strategy`, `/research auth providers`).
Otherwise, prompt the user for what to research.

> **Output**: Research brief + ranked implementation suggestions
> **Next**: `/review` (for plan critique) or `/spec` (to formalize)

## Phase 1: Gather Facts

Before forming any opinion, collect data from all available sources:

| Source | Action | Priority |
|--------|--------|----------|
| **Knowledge Items** | Check KI summaries for past decisions, rejected approaches, established patterns | 🔴 First |
| **Codebase** | Scan relevant files, `docs/`, config, TODOs, FIXMEs, recent git history | 🟡 Second |
| **Web** | Search for state-of-the-art, competitive analysis, best practices | 🟢 Third |

Do not skip any source. Log what you found (or didn't find) from each.

## Phase 2: Analyze

### Internal Analysis (not shown to user)

Answer these before generating suggestions:

- What is the project's **current bottleneck** related to `$ARGUMENTS`?
- What single change would **10× progress**?
- What's the **riskiest assumption** that hasn't been validated?
- What is the user **not asking about** that they should be?

Use these answers to filter and rank — don't just pattern-match TODOs.

## Phase 3: Present Findings

### Research Brief

Summarize key findings in a concise brief:

- **Context**: What exists today (from KIs + codebase).
- **Landscape**: What the industry does (from web research).
- **Gaps**: What's missing or outdated in the current approach.

### Ranked Suggestions

**Categories:** 🎯 Quick Win | ✨ Enhancement | 🚀 New Idea | 🔧 Refactor | ⚠️ Risk | 🛠️ Tooling

Start with a summary table:

| # | Suggestion | Category | Impact | Autonomy |
|---|------------|----------|--------|----------|
| 1 | [Title]    | 🎯/✨/🚀 | 🔴/🟡/🟢 | 🤖/🧑‍💻/🔄 |

Then expand each with a detail card:

> ### [Emoji] [Title]
>
> **Impact:** 🔴 Low / 🟡 Medium / 🟢 High
> **Autonomy:** 🤖 Full / 🧑‍💻 Guided / 🔄 Interactive
>
> [2-3 sentence description of what and why]
>
> **Tradeoffs:** ✅ Pro: [benefit] | ⚠️ Con: [risk or cost]
>
> **Depends on:** _(optional)_ #N or [prerequisite]

### Prioritization Rules

- Rank by **Impact × Autonomy** — high-impact items the agent can execute fully go first.
- ⚠️ Risks get priority regardless.
- 🎯 Quick Wins with high impact go next.
- Cap at **5 suggestions max**. Expand all with detail cards.

## Phase 4: Visualize

Generate visuals for any suggestion rated **🟡+ Impact** that changes system structure or user-facing layout.

- **UI / layout**: Use the `generate_image` tool to generate a mockup image.
- **Architecture / workflow**: Generate an architecture diagram or flowchart.

Attach directly below the relevant suggestion card. Skip for pure config or text-only changes.

## Phase 5: Recommend and Wait

Close with your recommendation:

> **💡 My recommendation:** **#N, #N** — [1-sentence reason tied to the bottleneck from Phase 2].

Present and wait — do not auto-implement.

---

## Rules

| Rule | Description |
|------|-------------|
| **Facts before opinions** | Phase 1 (gather) must complete before Phase 2 (analyze). Never skip research. |
| **Context first** | Never suggest without reading relevant KIs, codebase, and web sources. |
| **No auto-implement** | Present and wait for user's pick. |
| **Be specific** | Reference actual files, lines, or topics — no generic advice. |
| **State dependencies** | If suggestions conflict or depend on each other, say so. |
| **Cap at 5** | More than 5 suggestions creates decision paralysis. |
