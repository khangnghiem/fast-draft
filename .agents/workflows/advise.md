---
description: World-class structured advice with analysis, tradeoffs, and priorities
---

# /advise - Smart Suggestions

$ARGUMENTS

---

## Purpose

Understand the context, then provide structured, prioritized suggestions. Never auto-implement — present options and wait for the user's pick.

---

## Workflow

### 1. Understand the Context

// turbo-all

Before suggesting anything, orient yourself:

- Read root-level files (`README.md`, docs, config files, etc.) to understand what this project is
- Read any files directly related to `$ARGUMENTS`
- Check for existing analysis (changelogs, past decisions, docs) — don't re-discover what's already known
- Scan recent commits and open PRs — don't suggest what's already done or in progress

Then, if applicable:

```bash
# Recent changes (skip if not a git repo)
git log --oneline -20 2>/dev/null

# Open TODOs (broad scan, exclude noise)
grep -rn "TODO\|FIXME\|HACK\|XXX" . --exclude-dir='.git' --exclude-dir='node_modules' --exclude-dir='target' --exclude-dir='__pycache__' 2>/dev/null | head -30
```

### 2. Analyze (internal — not shown to user)

Before generating suggestions, answer these questions internally:

- What is the project's **current bottleneck**?
- What single change would **10× progress**?
- What's the **riskiest assumption** that hasn't been validated?
- What is the user **not asking about** that they should be?

Use these answers to filter and rank — don't just pattern-match TODOs.

### 3. Categorize Suggestions

| Emoji | Category        | Description                            |
| ----- | --------------- | -------------------------------------- |
| 🎯    | **Quick Win**   | Low effort, immediate value            |
| ✨    | **Enhancement** | Improve something that already exists  |
| 🚀    | **New Idea**    | Something that doesn't exist yet       |
| 🔧    | **Refactor**    | Better structure, no new behavior      |
| ⚠️    | **Risk**        | Potential issue before it bites        |
| 🛠️    | **Tooling**     | Better tools, workflows, or automation |

### 4. Format Each Suggestion

Use this format for each suggestion:

> ### [Emoji] [Title]
>
> **Effort:** 🟢 Low / 🟡 Medium / 🔴 High
>
> **Impact:** 🔴 Low / 🟡 Medium / 🟢 High
>
> **ROI:** ⭐ Low / ⭐⭐⭐ Medium / ⭐⭐⭐⭐⭐ High
>
> **Risk:** 🟢 Safe / 🟡 Reversible / 🔴 Breaking change
>
> **Autonomy:** 🤖 Full (fire-and-forget) / 🧑‍💻 Guided / 🔄 Interactive
>
> [2-3 sentence description of what and why]
>
> **Tradeoffs:**
>
> - ✅ Pro: [benefit]
> - ⚠️ Con: [risk or cost]
>
> **Depends on:** _(optional)_ #N or [prerequisite]

### 5. Prioritize

- Rank by ROI (impact ÷ effort)
- ⚠️ Risks get priority regardless of effort
- 🎯 Quick Wins with high impact go next
- Cap at **8 suggestions max**

### 6. Visualize (when helpful)

For suggestions involving **UI changes, architecture, or workflows**, generate a quick sketch to make the idea concrete:

| Suggestion type          | Visual to generate                           |
| ------------------------ | -------------------------------------------- |
| UI / layout change       | Mockup of the proposed interface             |
| Architecture / data flow | Diagram showing components and relationships |
| Workflow / process       | Flowchart of the proposed steps              |
| Refactor / restructure   | Before/after comparison diagram              |

**When to skip:** Pure config changes, dependency updates, or text-only fixes don't need visuals.

Attach the visual directly below the relevant suggestion card. Keep sketches minimal — the goal is **clarity, not polish**.

### 7. Present and Wait

Start with a summary table for quick comparison:

| #   | Suggestion | Effort   | Impact   | ROI           | Autonomy |
| --- | ---------- | -------- | -------- | ------------- | -------- |
| 1   | [Title]    | 🟢/🟡/🔴 | 🔴/🟡/🟢 | ⭐–⭐⭐⭐⭐⭐ | 🤖/🧑‍💻/🔄 |

Then list the full detail cards (from Step 4) below the table, with visuals from Step 6 where applicable.

Then close with your recommendation and options:

> **💡 My recommendation:** **#N, #N** — [1-sentence reason tied to the project's current bottleneck from Step 2].

---

## Rules

| Rule                  | Description                                    |
| --------------------- | ---------------------------------------------- |
| **Context first**     | Never suggest without reading relevant context |
| **No auto-implement** | Present and wait for user's pick               |
| **Max 8**             | Cap suggestions to avoid overwhelm             |
| **Be specific**       | Reference actual files, topics, or lines       |
| **Fit the project**   | Suggestions must match the project's goals     |

---

## Anti-Patterns

| ❌ Wrong                                       | ✅ Right                                                |
| ---------------------------------------------- | ------------------------------------------------------- |
| Generic advice anyone could give               | Specific to actual code/files found in Step 1           |
| "You should add tests"                         | "`auth.py` has 0 test coverage — add integration tests" |
| Suggesting things already done                 | Check recent commits and docs first                     |
| Suggesting conflicting items without noting it | State dependencies between suggestions                  |
| Dumping 8 items with equal weight              | Lead with top 3, group the rest under "also consider"   |
