---
description: Generate sequential AI agent prompts for implementing a feature
---

# /prompts — Sequential Implementation Prompts

$ARGUMENTS

---

## Purpose

Generate a numbered sequence of **copy-paste-ready** prompts that another AI agent executes one at a time to implement a feature.

---

## Workflow

### 1. Gather Context

Read: suggestion/spec doc, source files, `docs/REQUIREMENTS.md`, `docs/LESSONS.md`.

### 2. Decompose into Steps

Each prompt must be: **self-contained** (all context inline), **one concern**, **verifiable**, **idempotent**, **ordered**.

### 3. Prompt Format

````markdown
### Prompt N: [Short Title]

**Depends on:** Prompt N-1 (or "None")
**Files:** `path/to/file1`, `path/to/file2`

```
[Complete instruction — what, where, why, expected result.
Reference specific file paths, line numbers, CSS selectors.
End with verification step.]
```

**Verify:** [What "done" looks like]
````

### 4. Standard Sequences

**UI features:** HTML → CSS → JS → Cleanup → Zen mode → Test → E2E

**Rust/WASM features:** Model → Parser → Emitter → Tests → WASM bridge → Frontend → E2E

> [!IMPORTANT]
> **Every sequence MUST include dedicated test and E2E prompts.** Do not combine testing into implementation prompts — keep them separate for isolation and reliability.

### 5. Output

```markdown
## 🧩 Implementation Prompts: [Feature Name]

**Total prompts:** N
**Prerequisite:** [branch, prior work]

---

[Prompts 1–N, separated by ---]

---

### Testing (MANDATORY)

After implementation prompts, always include:

- [ ] **Unit/integration test prompt** — `/test` workflow (TDD: write failing tests → implement → green)
- [ ] **E2E browser prompt** — `/e2e` workflow (smoke tier for routine PRs, full tier for major features)

### Post-Implementation

- [ ] `/build` passes
- [ ] `/smoke` passes
- [ ] `/e2e` passes (smoke or full tier as appropriate)
- [ ] `/commit` + `/pr`
```

---

## Rules

| Rule                  | Description                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Min 3 prompts**     | We want agents to spend time doing work                                                                                                  |
| **Max 10 prompts**    | If more needed, split into sub-features                                                                                                  |
| **Copy-paste ready**  | Each prompt works standalone — no "see above"                                                                                            |
| **Concrete refs**     | Actual file paths, line numbers, selectors                                                                                               |
| **No ambiguity**      | Agent should never guess                                                                                                                 |
| **Test-last prompts** | Final 1–2 prompts are ALWAYS `/test`, `/e2e`                                                                                             |
| **Auto-pipeline**     | Every prompt MUST end with `/yolo /nonstop /e2e` so the agent runs the full build→test→commit→E2E pipeline autonomously without stopping |

---

## Integration

```
/suggest → pick → /prompts → execute 1–N → /test → /e2e → /build → /pr
```
