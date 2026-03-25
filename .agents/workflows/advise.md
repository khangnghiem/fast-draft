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

### 2. Deep Research & Deep Think

Before forming any opinions, invest time in genuine investigation:

**Deep Research:**

- Search the web for **current best practices**, prior art, and industry standards related to `$ARGUMENTS`
- Look for **real-world case studies**, post-mortems, or blog posts from teams who solved similar problems
- Check if there are **established patterns, libraries, or tools** that address the topic — don't reinvent the wheel
- Review **official documentation** for any technologies or APIs involved

> [!TIP]
> **Skip web research** if `$ARGUMENTS` is purely internal to this codebase (e.g., "toolbar layout", "panel sizing"). **Do research** when the topic involves external technologies, design patterns, industry practices, or unfamiliar territory.

**Deep Think:**

- Spend deliberate time reasoning about the problem from **first principles** — don't jump to the first solution that comes to mind
- Consider the problem from **multiple angles**: user experience, performance, maintainability, security, cost
- Think about **second-order effects** — what does each option unlock or block in the future?
- Challenge your own assumptions — ask "what if I'm wrong about X?"
- Sleep on it mentally: generate at least **3 distinct approaches** before evaluating any of them

> [!IMPORTANT]
> The quality of advice is directly proportional to the depth of research and thinking that precedes it. Shallow input → shallow output. Never skip this step.

### 3. Analyze (internal — not shown to user)

Before generating suggestions, answer these questions internally:

- What is the project's **current bottleneck**?
- What single change would **10× progress**?
- What's the **riskiest assumption** that hasn't been validated?
- What is the user **not asking about** that they should be?

Use these answers to filter and rank — don't just pattern-match TODOs.

### 4. Categorize Suggestions

| Emoji | Category        | Description                            |
| ----- | --------------- | -------------------------------------- |
| 🎯    | **Quick Win**   | Low effort, immediate value            |
| ✨    | **Enhancement** | Improve something that already exists  |
| 🚀    | **New Idea**    | Something that doesn't exist yet       |
| 🔧    | **Refactor**    | Better structure, no new behavior      |
| ⚠️    | **Risk**        | Potential issue before it bites        |
| 🛠️    | **Tooling**     | Better tools, workflows, or automation |

### 5. Format Each Suggestion

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

### 6. Prioritize

- Rank by ROI (impact ÷ effort)
- ⚠️ Risks get priority regardless of effort
- 🎯 Quick Wins with high impact go next
- Cap at **8 suggestions max**

### 7. Visualize (default ON)

> [!IMPORTANT]
> **Visuals are the default, not the exception.** Generate at least one image or diagram for every `/advise` call. A picture is worth a thousand tokens — users absorb visual suggestions 10× faster than text walls.

**For each suggestion, decide which visual to generate:**

| Suggestion type          | Visual tool                                                    |
| ------------------------ | -------------------------------------------------------------- |
| UI / layout change       | `generate_image` — mockup of the proposed interface            |
| Architecture / data flow | `generate_image` or Mermaid — components and relationships     |
| Workflow / process       | Mermaid diagram — flowchart of the proposed steps              |
| Refactor / restructure   | `generate_image` — before/after comparison                     |
| Performance / data       | Mermaid or table — benchmark comparisons, bottleneck highlight |

**Rules:**

- **Always call `generate_image` at least once** — every `/advise` must produce at least 1 generated image (mockup, diagram, or sketch). Pick the suggestion with the highest visual impact.
- Mermaid diagrams are **additional** — use them freely in the artifact for architecture, data flow, or process visuals, but they don't replace the mandatory `generate_image` call
- Attach each visual **directly below its suggestion card** so the connection is obvious
- Keep visuals minimal and focused — **clarity over polish**

**Only skip `generate_image` when ALL suggestions are:** pure config changes, dependency version bumps, or single-line text fixes with no spatial or structural component.

### 8. Present and Wait

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
