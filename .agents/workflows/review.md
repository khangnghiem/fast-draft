---
description: Review the work just done and suggest improvements
---

// turbo-all

# /review - Review & Improve

$ARGUMENTS

**Scope: Current conversation only.** Review ONLY the most recent work done in this conversation.
Do NOT audit the broader codebase, unrelated files, or prior conversations unless the user explicitly asks.

If `$ARGUMENTS` is provided, narrow the review further (e.g., `/review security`, `/review last commit`).

Be concise. No filler. Reference files and lines directly.

## 1. Gather What Changed

- Run `git diff` (or `git diff HEAD~1` for the most recent commit) to see exactly what was modified.
- Run `git status` to check for uncommitted changes.
- Cross-reference with the recent conversation context — only review files and changes touched in this session.

## 2. Self-Audit

Evaluate the changeset as a whole (not per-file):

| Dimension        | Question                                                  |
| ---------------- | --------------------------------------------------------- |
| **Intent Match** | Did the changes actually solve what the user asked for?   |
| **Correctness**  | Are there bugs, typos, or logic errors?                   |
| **Consistency**  | Does it follow the project's existing patterns and rules? |
| **Simplicity**   | Could this be achieved with less code or complexity?      |

If the changes involve user input, APIs, or secrets, also check **Security**.
If the changes involve logic or state, also check **Edge Cases** and **Test Coverage**.

## 3. Present Findings

### ✅ What Went Well
- List things that are solid and need no changes.

### 🔧 Improvements Found

Group findings by severity:
- 🔴 **Must fix** – Bugs, security issues, or broken functionality.
- 🟡 **Should fix** – Readability, maintainability, or performance concerns.
- 🟢 **Nice to have** – Minor style or refactoring suggestions.

For each issue, provide:

- **What:** The specific problem or gap.
- **Where:** File and line reference.
- **Fix:** A concrete code snippet or action — not vague advice.

Rank by impact. Lead with the most important improvement.

## 4. Apply Fixes

**Immediately apply any urgent improvements** (bugs, security, broken logic).
Flag and skip anything requiring user input or a design decision.

## 5. Summary

> **Before:** [1-line state before review]
> **After:** [1-line state after improvements]
> **Skipped:** [Items needing user decision, or "None"]

## 6. Suggest Improvements

If the review surfaced **strategic improvements** beyond the quick fixes already applied, present them:

| # | Suggestion | Category | Impact | Autonomy |
|---|------------|----------|--------|----------|
| 1 | [Title]    | 🎯/✨/🚀/🔧/⚠️/🛠️ | 🔴/🟡/🟢 | 🤖/🧑‍💻/🔄 |

For each, expand with a detail card and use the `generate_image` tool to visualize the suggestion. Keep the image intuitive:

> ### [Emoji] [Title]
>
> **Impact:** 🔴 Low / 🟡 Medium / 🟢 High
> **Autonomy:** 🤖 Full / 🧑‍💻 Guided / 🔄 Interactive
>
> [2-3 sentence description of what and why]
>
> **Tradeoffs:** ✅ Pro: [benefit] | ⚠️ Con: [risk or cost]

Rank by **Impact × Autonomy**. Cap at **5 suggestions max**. Present and wait — do not auto-implement.

If no strategic improvements were found, close the review.
