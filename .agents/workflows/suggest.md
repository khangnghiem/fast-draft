---
description: Structured suggestions with analysis, tradeoffs, and priorities
---

# /suggest - Smart Suggestions

$ARGUMENTS

---

## Purpose

Research the codebase thoroughly, then provide structured, prioritized suggestions. Never auto-implement — present options and wait for the user's pick.

---

## Workflow

### 1. Research First

// turbo-all

Before suggesting anything, read relevant context:

```bash
# Recent changes
git log --oneline -20

# Open issues / TODOs
grep -rn "TODO\|FIXME\|HACK\|XXX" crates/ fd-vscode/src/ --include="*.rs" --include="*.ts" | head -30
```

Also read:

- Relevant source files related to `$ARGUMENTS`
- `docs/REQUIREMENTS.md` for planned features and coverage gaps (⚠️ / ❌ rows)
- `docs/CHANGELOG.md` for recent changes
- `docs/LESSONS.md` for known pitfalls
- Any related test files for coverage gaps
- Open issues/PRs for in-flight work
- `examples/` for current usage patterns

### 2. Categorize Suggestions

Use these categories:

| Emoji | Category        | Description                            |
| ----- | --------------- | -------------------------------------- |
| 🎯    | **Quick Win**   | Low effort, immediate value            |
| ✨    | **Enhancement** | Improve existing feature               |
| 🚀    | **New Feature** | Something that doesn't exist yet       |
| 🔧    | **Refactor**    | Better code structure, no new behavior |
| ⚠️    | **Bug Risk**    | Potential issue before it bites        |
| 🛠️    | **DX**          | Developer experience improvement       |

### 3. Structure Each Suggestion

For each suggestion, provide:

```markdown
### [Emoji] [Title]

**Effort:** 🟢 Low / 🟡 Medium / 🔴 High
**Impact:** 🟢 Low / 🟡 Medium / 🔴 High
**ROI:** ⭐⭐⭐⭐⭐ (impact ÷ effort)

[2-3 sentence description of what and why]

**Tradeoffs:**

- ✅ Pro: [benefit]
- ⚠️ Con: [risk or cost]
```

### 4. Prioritize by ROI

- Rank suggestions by ROI (impact-to-effort ratio)
- 🎯 Quick Wins with high impact go first
- ⚠️ Bug Risks get priority regardless of effort
- Cap at **10 suggestions max** to avoid overwhelm

### 5. Present and Wait

Format the final output as:

```markdown
## 💡 Suggestions for [Topic]

Based on analysis of [what was reviewed].

[Ranked list of suggestions]

---

**Want to go deeper on any of these?** Pick a number and I'll:

- Create a detailed spec (`/spec`)
- Design the UI (`/design`)
- Jump straight to building (`/build`)
```

---

## Rules

| Rule                     | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| **Research first**       | Never suggest without reading relevant code             |
| **No auto-implement**    | Present and wait for user's pick                        |
| **Max 10**               | Cap suggestions to avoid overwhelm                      |
| **Be specific**          | Reference actual file paths and line numbers            |
| **Consider stack**       | Suggestions must fit Rust/WASM + VS Code extension arch |
| **Respect requirements** | Check `REQUIREMENTS.md` before suggesting duplicates    |

---

## Scope Modifiers

The user can narrow scope with keywords:

| Modifier             | Focus                                       |
| -------------------- | ------------------------------------------- |
| `/suggest parser`    | fd-core parser, emitter, round-trips        |
| `/suggest renderer`  | fd-render, fd-wasm, canvas rendering        |
| `/suggest editor`    | fd-editor tools, sync, commands             |
| `/suggest extension` | fd-vscode TypeScript, webview, panels       |
| `/suggest tests`     | Test coverage gaps, test quality            |
| `/suggest perf`      | Performance bottlenecks, 16ms budget        |
| `/suggest dx`        | Developer experience, tooling, CI, workflow |
| `/suggest [feature]` | Specific feature area (e.g., `edges`, `ai`) |

---

## Integration

```
/suggest → pick suggestion → /spec → /design → /build → /pr
```
