---
description: Document repeated mistakes so AI agents avoid them in the future
---

# /learn - Error Memory

$ARGUMENTS

---

## Purpose

When an error or mistake keeps recurring, document it in `docs/LESSONS.md` so every future agent session learns from it. This creates a persistent, growing knowledge base that prevents repeated failures.

---

## When to Use

- An agent made the **same mistake twice or more**
- You discovered a **non-obvious gotcha** that future agents will hit
- A debugging session revealed a **subtle root cause** worth preserving
- A CI failure keeps recurring for the **same underlying reason**

---

## Workflow

### 1. Identify the Pattern

Determine what went wrong and why it keeps happening:

- What was the **symptom**? (compiler error, runtime bug, wrong output)
- What was the **root cause**? (wrong assumption, missing step, stale knowledge)
- What's the **correct approach**?

### 2. Check for Duplicates

// turbo

```bash
grep -i "$ARGUMENTS" docs/LESSONS.md
```

If a similar lesson exists, **extend it** with the new context instead of adding a duplicate.

### 3. Categorize

Pick the most relevant category:

| Category        | Examples                                      |
| --------------- | --------------------------------------------- |
| **Parser**      | winnow combinators, round-trip failures       |
| **Emitter**     | Field ordering, indentation, missing fields   |
| **Layout**      | Bounds calculation, constraint resolution     |
| **Renderer**    | Vello/wgpu, paint order, hit testing          |
| **Editor**      | Sync engine, undo/redo, tool state            |
| **VS Code**     | Extension API, webview, pnpm, packaging       |
| **WASM**        | Build targets, feature flags, wasm-pack       |
| **CI/CD**       | GitHub Actions, test flakiness, clippy lints  |
| **Git**         | Branch workflow, merge conflicts, hooks       |
| **FD Format**   | Syntax, semantics, spec blocks, themes        |
| **Cross-Crate** | Dependency ordering, trait bounds, re-exports |
| **Testing**     | Test setup, mocking, assertion patterns       |

### 4. Write the Lesson

Append to `docs/LESSONS.md` using this template:

```markdown
---

## [Category]: [Short Title]

**Date**: YYYY-MM-DD
**Context**: [1-2 sentences: what were you trying to do?]

**Root cause**: [What actually went wrong and why]

**Fix**: [The correct approach — be specific with file paths and code patterns]

**Lesson**: [The generalizable takeaway that prevents this class of error]
```

### 5. Consider Promoting to GEMINI.md

If the lesson is **critical enough** that it should be a hard rule (not just a lesson), add it to `GEMINI.md` under the appropriate tier:

- **TIER 0** — Universal (applies to all tasks)
- **TIER 1** — Stack-specific (Rust, FD format, rendering, VS Code)
- **TIER 2** — CI/CD (pre-commit checks)

> [!IMPORTANT]
> Only promote to GEMINI.md if the mistake is **extremely common** or has **severe consequences**. Most lessons belong in `LESSONS.md`.

---

## Rules

| Rule                    | Description                                              |
| ----------------------- | -------------------------------------------------------- |
| **Be specific**         | Include file paths, function names, exact error messages |
| **Root cause required** | Symptoms alone don't prevent recurrence                  |
| **No duplicates**       | Extend existing lessons, don't repeat them               |
| **Date every entry**    | Track when lessons were learned                          |
| **Keep it concise**     | 1 paragraph per section max — not a blog post            |
| **Actionable fix**      | Tell future agents exactly what to do instead            |

---

## Integration

```
error occurs → investigate → /learn → future agents read LESSONS.md
                                    ↘ promote to GEMINI.md (if critical)
```

All workflows that involve research (`/suggest`, `/debug`, `/build`) should read `docs/LESSONS.md` as part of their context-gathering step.
