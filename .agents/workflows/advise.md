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

- Read root-level files (`README.md`, docs) and any files related to `$ARGUMENTS`
- Check past decisions (changelogs, docs) so you don't re-discover knowns

Then run:

```bash
git log --oneline -20 2>/dev/null
rg -n "TODO|FIXME|HACK|XXX" . -g '!.git' -g '!node_modules' -g '!target' 2>/dev/null | head -30
```

### 2. Deep Research & Deep Think

Before forming any opinions, invest time in genuine investigation:

**Deep Research:**
*(Trigger when: Topic involves external libraries, APIs, unfamiliar domain, architecture)*
- Search the web for **best practices**, prior art, and industry standards related to `$ARGUMENTS`
- Look for **real-world case studies** or blog posts from teams who solved similar problems
- Check **established patterns or tools** — don't reinvent the wheel
- Review **official documentation** for any technologies involved

> [!TIP]
> **Skip web research** if `$ARGUMENTS` is purely internal to this codebase. **Do research** when the topic involves external technologies or unfamiliar territory (max 3 web searches).

**Deep Think:**
- Reason from **first principles** — don't jump to the first solution
- Consider the problem from **multiple angles**: UX, performance, maintainability, cost
- Think about **second-order effects** — what does each option unlock or block later?
- Steel-man alternatives — consider the opposite approach and why it might be better

> [!IMPORTANT]
> The quality of advice is directly proportional to the depth of research and thinking. Shallow input → shallow output. Never skip Deep Think.

### 3. Analyze (internal — not shown to user)

Before generating suggestions, answer these questions internally:

- What is the project's **current bottleneck**?
- What single change would **10× progress**?
- What's the **riskiest assumption** that hasn't been validated?
- What is the user **not asking about** that they should be?

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

> ### [Emoji] [Title]
>
> **Effort:** 🟢 Low / 🟡 Medium / 🔴 High  |  **Impact:** 🔴 Low / 🟡 Medium / 🟢 High
> **ROI:** ⭐ Low / ⭐⭐⭐ Medium / ⭐⭐⭐⭐⭐ High
> **Risk:** 🟢 Safe / 🟡 Reversible / 🔴 Breaking change
> **Autonomy:** 🤖 Full / 🧑‍💻 Guided / 🔄 Interactive
>
> [2-3 sentence description of what and why]
>
> **Tradeoffs:**
> - ✅ Pro: [benefit]
> - ⚠️ Con: [risk or cost]
>
> **Depends on:** _(optional)_ #N or [prerequisite]

### 6. Prioritize

- Rank by ROI (impact ÷ effort). ⚠️ Risks get priority. Cap at **8 suggestions max**.

### 7. Visualize (default ON)

> [!IMPORTANT]
> Users absorb visual suggestions 10× faster than text walls.

**Rules:**
- **Always call `generate_image` exactly once per `/advise`** — pick the suggestion with the highest visual impact (usually a UI mockup or architecture diagram).
- Mermaid diagrams are **additional** — use them freely in the artifact for data flow or process visuals, but they don't replace the mandatory `generate_image` call.
- Attach each visual **directly below its suggestion card**.
- Keep visuals minimal and focused — **clarity over polish**.
- **Skip `generate_image` ONLY when ALL suggestions are:** pure config changes, version bumps, or text fixes.

### 8. Present and Wait

Start with a summary table, then list detail cards (Step 5) with visuals (Step 7). Close with:

> **💡 My recommendation:** **#N, #N** — [1-sentence reason tied to bottleneck].

---

## Rules

| Rule                  | Description                                    |
| --------------------- | ---------------------------------------------- |
| **Context first**     | Never suggest without reading relevant context |
| **No auto-implement** | Present options and wait for user's pick       |
| **Fit the project**   | Suggestions must match the project's goals     |

---

## Anti-Patterns

| ❌ Wrong                                       | ✅ Right                                                |
| ---------------------------------------------- | ------------------------------------------------------- |
| Generic advice anyone could give               | Specific to actual code/files found in Step 1           |
| "You should add tests"                         | "`auth.py` has 0 test coverage — add integration tests" |
| Suggesting conflicting items without noting it | State dependencies between suggestions                  |
