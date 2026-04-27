# OpenCode Recent Prompt Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local OpenCode plugin that shows the latest non-command user prompt in the TUI sidebar.

**Architecture:** Implement one explicit local TUI plugin file loaded from `/Users/khangnghiem/.config/opencode/opencode.json`. Keep prompt selection and text sanitization as exported pure helpers so they can be tested with Node without launching OpenCode. Render via OpenCode TUI `sidebar_content`; do not persist prompt text to disk.

**Tech Stack:** OpenCode 1.14.28 TUI plugin slots, ESM JavaScript, Node built-in test runner, pseudo-TTY runtime smoke script.

---

## Important Constraints

- Use `/Users/khangnghiem/.config/opencode/opencode.json` as the authoritative OpenCode config path.
- Do not rediscover OpenCode config paths.
- Do not broad-search `~/.config/opencode`, `~/.cache/opencode`, Homebrew, or the repo root.
- Do not commit unless the user explicitly asks for a commit. The checkpoint steps below use `git status`, not `git commit`.
- Keep v1 memory-only. Do not write prompt text to disk.
- Exclude slash commands from the sidebar preview.

## File Structure

- Create: `/Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.mjs`
  - Local OpenCode TUI plugin.
  - Exports pure helpers for tests.
  - Registers `sidebar_content` only; title/footer are not needed for v1.
- Create: `/Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.test.mjs`
  - Node tests for sanitization, prompt extraction, prompt selection, config defaults, and render fallback behavior.
- Modify: `/Users/khangnghiem/.config/opencode/opencode.json`
  - Add explicit plugin entry: `file:///Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.mjs`.
- Create: `/Users/khangnghiem/fast-draft/.scratch/opencode-recent-prompts-sidebar-smoke.py`
  - Ephemeral Python pseudo-TTY smoke test that launches OpenCode, toggles sidebar, and confirms `sidebar_content` ran.
  - Do not commit this file.

---

### Task 1: Pure Prompt Helpers

**Files:**
- Create: `/Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.mjs`
- Create: `/Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.test.mjs`

- [ ] **Step 1: Write failing helper tests**

Create `/Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.test.mjs` with:

```js
import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_CONFIG,
  extractMessageText,
  normalizeConfig,
  renderSidebarText,
  sanitizePromptText,
  selectLatestUserPrompt,
  toPreview,
} from "./recent-prompts-sidebar.mjs"

test("sanitizePromptText strips ANSI, controls, and collapses whitespace", () => {
  const input = "\u001b[31mhello\u001b[0m\n\tworld\u0007"
  assert.equal(sanitizePromptText(input), "hello world")
})

test("toPreview truncates long prompts with ellipsis", () => {
  assert.equal(toPreview("abcdef", { previewChars: 4 }), "abcd…")
})

test("toPreview returns empty string for blank input", () => {
  assert.equal(toPreview("  \n\t  ", { previewChars: 80 }), "")
})

test("extractMessageText reads OpenCode part text", () => {
  const message = { parts: [{ type: "text", text: "first" }, { text: " second" }] }
  assert.equal(extractMessageText(message), "first second")
})

test("extractMessageText falls back to direct content strings", () => {
  assert.equal(extractMessageText({ content: "hello" }), "hello")
})

test("selectLatestUserPrompt returns newest user text message", () => {
  const messages = [
    { info: { role: "user", id: "u1" }, parts: [{ text: "older" }] },
    { info: { role: "assistant", id: "a1" }, parts: [{ text: "answer" }] },
    { info: { role: "user", id: "u2" }, parts: [{ text: "newer" }] },
  ]
  assert.deepEqual(selectLatestUserPrompt(messages), {
    id: "u2",
    text: "newer",
  })
})

test("selectLatestUserPrompt excludes slash commands", () => {
  const messages = [
    { info: { role: "user", id: "u1" }, parts: [{ text: "normal prompt" }] },
    { info: { role: "user", id: "u2" }, parts: [{ text: "/model openai/gpt-5.5" }] },
  ]
  assert.deepEqual(selectLatestUserPrompt(messages), {
    id: "u1",
    text: "normal prompt",
  })
})

test("selectLatestUserPrompt excludes tool and synthetic messages", () => {
  const messages = [
    { info: { role: "user", id: "u1" }, parts: [{ text: "real prompt" }] },
    { info: { role: "user", id: "u2" }, type: "tool", parts: [{ text: "tool result" }] },
    { info: { role: "user", id: "u3" }, synthetic: true, parts: [{ text: "synthetic" }] },
  ]
  assert.deepEqual(selectLatestUserPrompt(messages), {
    id: "u1",
    text: "real prompt",
  })
})

test("selectLatestUserPrompt caps internal prompt bytes", () => {
  const messages = [
    { info: { role: "user", id: "u1" }, parts: [{ text: "abcdefghij" }] },
  ]
  assert.deepEqual(selectLatestUserPrompt(messages, { maxPromptBytes: 4 }), {
    id: "u1",
    text: "abcd",
  })
})

test("normalizeConfig keeps safe defaults on malformed values", () => {
  assert.deepEqual(normalizeConfig({ enabled: "yes", previewChars: -1, maxPromptBytes: "big" }), DEFAULT_CONFIG)
})

test("renderSidebarText shows empty state when no prompt exists", () => {
  assert.equal(renderSidebarText([], DEFAULT_CONFIG), "Recent Prompt\nNo prompt yet")
})

test("renderSidebarText shows latest preview", () => {
  const messages = [{ info: { role: "user", id: "u1" }, parts: [{ text: "hello\nworld" }] }]
  assert.equal(renderSidebarText(messages, DEFAULT_CONFIG), "Recent Prompt\nhello world")
})

test("renderSidebarText truncates long prompt previews with ellipsis", () => {
  const messages = [{ info: { role: "user", id: "u1" }, parts: [{ text: "abcdef" }] }]
  assert.equal(renderSidebarText(messages, { ...DEFAULT_CONFIG, previewChars: 4 }), "Recent Prompt\nabcd…")
})
```

- [ ] **Step 2: Run tests to verify they fail because the module does not exist**

Run:

```bash
node --test /Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.test.mjs
```

Expected: FAIL with a module-not-found error for `recent-prompts-sidebar.mjs`.

- [ ] **Step 3: Write minimal helper implementation**

Create `/Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.mjs` with:

```js
export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  maxPromptBytes: 4096,
  previewChars: 80,
})

const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g
const CONTROL_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g

let loggedReadFailure = false

export function normalizeConfig(options = {}) {
  const input = options && typeof options === "object" ? options : {}
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_CONFIG.enabled,
    maxPromptBytes:
      Number.isInteger(input.maxPromptBytes) && input.maxPromptBytes > 0 && input.maxPromptBytes <= 65536
        ? input.maxPromptBytes
        : DEFAULT_CONFIG.maxPromptBytes,
    previewChars:
      Number.isInteger(input.previewChars) && input.previewChars > 0 && input.previewChars <= 500
        ? input.previewChars
        : DEFAULT_CONFIG.previewChars,
  }
}

export function sanitizePromptText(value) {
  return String(value ?? "")
    .replace(ANSI_PATTERN, "")
    .replace(CONTROL_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim()
}

function truncateBytes(text, maxBytes) {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(text)
  if (bytes.length <= maxBytes) return text

  let output = ""
  let used = 0
  for (const char of text) {
    const size = encoder.encode(char).length
    if (used + size > maxBytes) break
    output += char
    used += size
  }
  return output
}

export function toPreview(text, config = DEFAULT_CONFIG) {
  const normalized = sanitizePromptText(text)
  if (!normalized) return ""
  if (normalized.length <= config.previewChars) return normalized
  return `${normalized.slice(0, config.previewChars)}…`
}

export function extractMessageText(message) {
  if (!message || typeof message !== "object") return ""

  if (Array.isArray(message.parts)) {
    return message.parts
      .map((part) => {
        if (!part || typeof part !== "object") return ""
        if (typeof part.text === "string") return part.text
        if (typeof part.content === "string") return part.content
        return ""
      })
      .join("")
  }

  if (typeof message.text === "string") return message.text
  if (typeof message.content === "string") return message.content
  if (typeof message.message === "string") return message.message
  return ""
}

function getMessageRole(message) {
  return message?.info?.role ?? message?.role ?? message?.author?.role
}

function getMessageId(message, index) {
  return String(message?.info?.id ?? message?.id ?? message?.messageID ?? `index:${index}`)
}

function isSyntheticOrToolMessage(message) {
  if (!message || typeof message !== "object") return true
  if (message.synthetic === true) return true
  const type = String(message.type ?? message.info?.type ?? "").toLowerCase()
  const blockedMessageTypes = new Set(["tool", "tool-call", "tool-result", "system", "synthetic"])
  if (blockedMessageTypes.has(type)) return true
  if (Array.isArray(message.parts)) {
    return message.parts.some((part) => {
      const partType = String(part?.type ?? "").toLowerCase()
      return partType === "tool" || partType === "tool-call" || partType === "tool-result"
    })
  }
  return false
}

export function selectLatestUserPrompt(messages, config = DEFAULT_CONFIG) {
  if (!Array.isArray(messages)) return null

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (getMessageRole(message) !== "user") continue
    if (isSyntheticOrToolMessage(message)) continue

    const rawText = truncateBytes(extractMessageText(message), config.maxPromptBytes)
    const text = sanitizePromptText(rawText)
    if (!text) continue
    if (text.startsWith("/")) continue

    return {
      id: getMessageId(message, index),
      text,
    }
  }

  return null
}

export function renderSidebarText(messages, config = DEFAULT_CONFIG) {
  const prompt = selectLatestUserPrompt(messages, config)
  if (!prompt) return "Recent Prompt\nNo prompt yet"
  return `Recent Prompt\n${toPreview(prompt.text, config)}`
}

function readCurrentSessionMessages(api) {
  const route = api?.route?.current
  if (!route || route.name !== "session") return []
  const sessionID = route.params?.sessionID
  if (!sessionID) return []
  return api?.state?.session?.messages?.(sessionID) ?? []
}

function renderFromApi(api, config) {
  try {
    return renderSidebarText(readCurrentSessionMessages(api), config)
  } catch (error) {
    if (!loggedReadFailure) {
      loggedReadFailure = true
      console.warn("[recent-prompts-sidebar] failed to read session messages", error)
    }
    return "Recent Prompt\nNo prompt yet"
  }
}

export default {
  id: "recent-prompts-sidebar",
  tui: async (api, options) => {
    const config = normalizeConfig(options)
    if (!config.enabled) return
    if (!api?.slots?.register) {
      console.warn("[recent-prompts-sidebar] sidebar slot API unavailable")
      return
    }

    api.slots.register({
      id: "recent-prompts-sidebar",
      slots: {
        sidebar_content() {
          return renderFromApi(api, config)
        },
      },
    })
  },
}
```

- [ ] **Step 4: Run helper tests to verify they pass**

Run:

```bash
node --test /Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.test.mjs
```

Expected: PASS for all tests.

- [ ] **Step 5: Checkpoint state without committing**

Run:

```bash
git -C /Users/khangnghiem/fast-draft status --short --branch
```

Expected: branch remains `docs/opencode-recent-prompts-sidebar`; only repo docs/plan changes are shown. Local OpenCode plugin files live outside this repo and will not appear in this status.

---

### Task 2: Install Plugin in OpenCode Config

**Files:**
- Modify: `/Users/khangnghiem/.config/opencode/opencode.json`

- [ ] **Step 1: Back up and update config with exact path**

Before running this step, show the proposed config change and get explicit user confirmation. This step mutates the user's global OpenCode config, not repo-local state. It creates this rollback backup: `/Users/khangnghiem/.config/opencode/opencode.json.recent-prompts-sidebar.bak`.

Run:

```bash
python3 - <<'PY'
import json
from pathlib import Path

path = Path('/Users/khangnghiem/.config/opencode/opencode.json')
plugin = 'file:///Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.mjs'
backup = path.with_suffix('.json.recent-prompts-sidebar.bak')

backup.write_text(path.read_text())
data = json.loads(path.read_text())
plugins = data.setdefault('plugin', [])
if plugin not in plugins:
    plugins.append(plugin)
path.write_text(json.dumps(data, indent=2) + '\n')
print(f'backup={backup}')
print(f'plugin_present={plugin in data["plugin"]}')
PY
```

Expected: output includes `plugin_present=True`.

- [ ] **Step 2: Verify config contains the plugin exactly once**

Run:

```bash
python3 - <<'PY'
import json
from pathlib import Path

path = Path('/Users/khangnghiem/.config/opencode/opencode.json')
plugin = 'file:///Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.mjs'
data = json.loads(path.read_text())
count = data.get('plugin', []).count(plugin)
print(f'plugin_count={count}')
raise SystemExit(0 if count == 1 else 1)
PY
```

Expected: `plugin_count=1` and exit 0.

- [ ] **Step 3: Verify OpenCode still starts far enough to load plugins**

Run:

```bash
python3 - <<'PY'
import os, pty, select, signal, subprocess, time

master, slave = pty.openpty()
proc = subprocess.Popen(
    ['opencode', '-c'],
    stdin=slave,
    stdout=slave,
    stderr=slave,
    cwd='/Users/khangnghiem/fast-draft',
    preexec_fn=os.setsid,
)
os.close(slave)
output = bytearray()
try:
    start = time.time()
    while time.time() - start < 10:
        r, _, _ = select.select([master], [], [], 0.2)
        if r:
            chunk = os.read(master, 4096)
            if not chunk:
                break
            output.extend(chunk)
finally:
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait(timeout=2)
    os.close(master)

decoded = bytes(output).decode('utf-8', errors='replace')
print(f'exit={proc.returncode}')
print(f'bytes={len(output)}')
if '[recent-prompts-sidebar]' in decoded:
    raise SystemExit('recent prompts plugin emitted warning during startup')
PY
```

Expected: no `[recent-prompts-sidebar]` warning, output reports nonzero `bytes` from TUI startup.

- [ ] **Step 4: Checkpoint config diff manually**

Run:

```bash
python3 - <<'PY'
import json
from pathlib import Path

path = Path('/Users/khangnghiem/.config/opencode/opencode.json')
data = json.loads(path.read_text())
for item in data.get('plugin', []):
    print(item)
PY
```

Expected: existing plugin entries remain unchanged and `file:///Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.mjs` appears once.

---

### Task 3: Runtime Sidebar Smoke Test

**Files:**
- Create: `/Users/khangnghiem/fast-draft/.scratch/opencode-recent-prompts-sidebar-smoke.py`

- [ ] **Step 1: Write smoke script**

Create `/Users/khangnghiem/fast-draft/.scratch/opencode-recent-prompts-sidebar-smoke.py` with:

```python
import os
import pty
import select
import signal
import subprocess
import time
from pathlib import Path

plugin_path = Path('/Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.mjs')
marker = Path('/Users/khangnghiem/fast-draft/.scratch/recent-prompts-sidebar-smoke.log')
original = plugin_path.read_text()
marker.unlink(missing_ok=True)

instrumented_body = original.replace(
    'return renderFromApi(api, config)',
    f"fs.appendFileSync('{marker}', 'sidebar_content\\n'); return renderFromApi(api, config)",
)
if instrumented_body == original:
    raise SystemExit('instrumentation target not found')

plugin_path.write_text('import fs from "node:fs"\n' + instrumented_body)
master = slave = None
proc = None
output = bytearray()
sent_toggle = False

try:
    master, slave = pty.openpty()
    proc = subprocess.Popen(
        ['opencode', '-c'],
        stdin=slave,
        stdout=slave,
        stderr=slave,
        cwd='/Users/khangnghiem/fast-draft',
        preexec_fn=os.setsid,
    )
    os.close(slave)
    slave = None

    start = time.time()
    while time.time() - start < 8:
        r, _, _ = select.select([master], [], [], 0.2)
        if r:
            chunk = os.read(master, 4096)
            if not chunk:
                break
            output.extend(chunk)
        if time.time() - start > 3 and not sent_toggle:
            os.write(master, b'\x02')
            sent_toggle = True

    os.killpg(proc.pid, signal.SIGTERM)
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait(timeout=2)
finally:
    if slave is not None:
        os.close(slave)
    if master is not None:
        try:
            os.close(master)
        except OSError:
            pass
    plugin_path.write_text(original)

invoked = marker.exists() and 'sidebar_content' in marker.read_text()
print(f'output_bytes={len(output)}')
print(f'sent_toggle={sent_toggle}')
print(f'sidebar_content_invoked={invoked}')
marker.unlink(missing_ok=True)
raise SystemExit(0 if sent_toggle and len(output) > 0 and invoked else 1)
```

- [ ] **Step 2: Run smoke script**

Run:

```bash
python3 /Users/khangnghiem/fast-draft/.scratch/opencode-recent-prompts-sidebar-smoke.py
```

Expected: `sent_toggle=True`, `sidebar_content_invoked=True`, and exit 0. The script restores the plugin file before exiting.

- [ ] **Step 3: Manually verify visible behavior in OpenCode**

Run:

```bash
opencode -c
```

Manual actions:

1. Press `ctrl+b` to open sidebar.
2. Submit a normal prompt such as `Say the word sidebar-test only`.
3. Confirm sidebar shows `Recent Prompt` and `Say the word sidebar-test only`.
4. Submit `/model openai/gpt-5.5` or another slash command.
5. Confirm sidebar still shows the previous normal prompt.
6. Exit OpenCode.

Expected: latest normal prompt remains visible; slash command does not replace it.

---

### Task 4: Final Verification and Cleanup

**Files:**
- Verify: `/Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.mjs`
- Verify: `/Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.test.mjs`
- Verify: `/Users/khangnghiem/.config/opencode/opencode.json`
- Verify: `/Users/khangnghiem/fast-draft/docs/superpowers/specs/2026-04-27-opencode-recent-prompts-sidebar-design.md`
- Verify: `/Users/khangnghiem/fast-draft/docs/superpowers/plans/2026-04-27-opencode-recent-prompts-sidebar.md`

- [ ] **Step 0: Roll back config from backup if verification fails or implementation is abandoned**

Run only if Task 2 or Task 3 fails, or if the user asks to abandon the plugin install:

```bash
cp /Users/khangnghiem/.config/opencode/opencode.json.recent-prompts-sidebar.bak /Users/khangnghiem/.config/opencode/opencode.json
```

Expected: OpenCode config returns to the pre-install state. Re-run Task 2 Step 2 and expect `plugin_count=0` for the recent prompts plugin.

- [ ] **Step 1: Run unit tests**

Run:

```bash
node --test /Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Verify OpenCode config has the plugin once and no spike entries**

Run:

```bash
python3 - <<'PY'
import json
from pathlib import Path

config = Path('/Users/khangnghiem/.config/opencode/opencode.json')
data = json.loads(config.read_text())
plugins = data.get('plugin', [])
recent = 'file:///Users/khangnghiem/.config/opencode/plugins/recent-prompts-sidebar.mjs'
spikes = [item for item in plugins if 'opencode-recent-prompts-spike' in item]
print(f'recent_count={plugins.count(recent)}')
print(f'spike_entries={spikes if spikes else "none"}')
raise SystemExit(0 if plugins.count(recent) == 1 and not spikes else 1)
PY
```

Expected: `recent_count=1`, `spike_entries=none`, exit 0.

- [ ] **Step 3: Verify repo status**

Run:

```bash
git -C /Users/khangnghiem/fast-draft status --short --branch
```

Expected: branch `docs/opencode-recent-prompts-sidebar`; docs/spec and docs/plan changes visible. `.scratch/` files are ignored and not staged.

- [ ] **Step 4: Record verification result in final response**

Report exact commands run and results. Do not claim success without the fresh command output from Steps 1–3 and the manual OpenCode check from Task 3 Step 3.

---

## Self-Review Notes

- Spec coverage: plan covers local TUI plugin, latest prompt only, slash command exclusion, memory-only v1, single-line preview plus truncation, fail-closed behavior, config path, gate-zero runtime smoke, and cleanup checks.
- Placeholder scan: no unresolved placeholder tokens or vague implementation-only instructions remain.
- Type consistency: helper names used in tests match helper exports in plugin code; plugin file path is consistent across tasks; config entry is consistent across tasks.
