# Provider Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-provider preset blocks to `oh-my-opencode-slim.json` and a `/provider` switch script so the user can change all agent models to a single provider from within OpenCode.

**Architecture:** Three provider presets (`openai`, `github-copilot`, `ollama-cloud`) live inside the existing `presets` map. A Node.js script atomically updates `preset`, `fallback.chains`, and `manualPlan` in `oh-my-opencode-slim.json`. Council councillors (alpha/beta/gamma) are never touched by the script.

**Tech Stack:** Node.js ESM script (`.mjs`), `jq`-style JSON manipulation via native `JSON.parse/stringify`, no external dependencies.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `~/.config/opencode/oh-my-opencode-slim.json` | Modify | Add `openai`, `github-copilot`, `ollama-cloud` preset blocks |
| `~/.config/opencode/bin/provider-switch.mjs` | Create | Script that atomically switches provider |
| `~/.config/opencode/commands/provider.md` | Create | OpenCode slash-command definition for `/provider` |

---

### Task 1: Add provider preset blocks to oh-my-opencode-slim.json

**Files:**
- Modify: `~/.config/opencode/oh-my-opencode-slim.json`

> **Safety note:** The existing `custom` preset must remain intact — only add new blocks. The `council` section must not change at all.

- [ ] **Step 1: Read the current file to confirm baseline**

```bash
node -e "const c = JSON.parse(require('fs').readFileSync(process.env.HOME+'/.config/opencode/oh-my-opencode-slim.json','utf8')); console.log('preset:', c.preset); console.log('presets keys:', Object.keys(c.presets)); console.log('council default_preset:', c.council?.default_preset)"
```

Expected output:
```
preset: custom
presets keys: [ 'custom' ]
council default_preset: default
```

- [ ] **Step 2: Write the updated config with three provider presets**

Open `~/.config/opencode/oh-my-opencode-slim.json` and replace the `presets` block with the version below. **Do not touch any other top-level key.**

The new `presets` value (merged alongside existing `"custom"` block):

```json
"presets": {
  "custom": {
    "orchestrator": {
      "model": "openai/gpt-5.5",
      "variant": "high",
      "skills": ["*"],
      "mcps": ["*", "!context7"]
    },
    "council": {
      "model": "github-copilot/claude-opus-4.7",
      "variant": "xhigh",
      "skills": [],
      "mcps": []
    },
    "oracle": {
      "model": "github-copilot/claude-opus-4.7",
      "variant": "xhigh",
      "skills": ["simplify"],
      "mcps": []
    },
    "librarian": {
      "model": "github-copilot/gpt-5-mini",
      "variant": "low",
      "skills": [],
      "mcps": ["websearch", "context7", "grep_app"]
    },
    "explorer": {
      "model": "github-copilot/gpt-5-mini",
      "variant": "low",
      "skills": [],
      "mcps": []
    },
    "designer": {
      "model": "openai/gpt-5.5",
      "variant": "xhigh",
      "skills": ["agent-browser"],
      "mcps": []
    },
    "fixer": {
      "model": "openai/gpt-5.5",
      "variant": "high",
      "skills": [],
      "mcps": []
    }
  },
  "openai": {
    "orchestrator": {
      "model": "openai/gpt-5.5",
      "variant": "high",
      "skills": ["*"],
      "mcps": ["*", "!context7"]
    },
    "council": {
      "model": "openai/gpt-5.5",
      "variant": "xhigh",
      "skills": [],
      "mcps": []
    },
    "oracle": {
      "model": "openai/gpt-5.5",
      "variant": "xhigh",
      "skills": ["simplify"],
      "mcps": []
    },
    "librarian": {
      "model": "openai/gpt-5-mini",
      "variant": "low",
      "skills": [],
      "mcps": ["websearch", "context7", "grep_app"]
    },
    "explorer": {
      "model": "openai/gpt-5-mini",
      "variant": "low",
      "skills": [],
      "mcps": []
    },
    "designer": {
      "model": "openai/gpt-5.5",
      "variant": "xhigh",
      "skills": ["agent-browser"],
      "mcps": []
    },
    "fixer": {
      "model": "openai/gpt-5.5",
      "variant": "high",
      "skills": [],
      "mcps": []
    }
  },
  "github-copilot": {
    "orchestrator": {
      "model": "github-copilot/claude-sonnet-4.6",
      "variant": "high",
      "skills": ["*"],
      "mcps": ["*", "!context7"]
    },
    "council": {
      "model": "github-copilot/claude-opus-4.7",
      "variant": "xhigh",
      "skills": [],
      "mcps": []
    },
    "oracle": {
      "model": "github-copilot/claude-opus-4.7",
      "variant": "xhigh",
      "skills": ["simplify"],
      "mcps": []
    },
    "librarian": {
      "model": "github-copilot/gpt-5-mini",
      "variant": "low",
      "skills": [],
      "mcps": ["websearch", "context7", "grep_app"]
    },
    "explorer": {
      "model": "github-copilot/gpt-5-mini",
      "variant": "low",
      "skills": [],
      "mcps": []
    },
    "designer": {
      "model": "github-copilot/claude-opus-4.7",
      "variant": "xhigh",
      "skills": ["agent-browser"],
      "mcps": []
    },
    "fixer": {
      "model": "github-copilot/gpt-5.3-codex",
      "variant": "high",
      "skills": [],
      "mcps": []
    }
  },
  "ollama-cloud": {
    "orchestrator": {
      "model": "ollama-cloud/deepseek-v4-pro",
      "variant": "high",
      "skills": ["*"],
      "mcps": ["*", "!context7"]
    },
    "council": {
      "model": "ollama-cloud/deepseek-v4-pro",
      "variant": "xhigh",
      "skills": [],
      "mcps": []
    },
    "oracle": {
      "model": "ollama-cloud/deepseek-v4-pro",
      "variant": "xhigh",
      "skills": ["simplify"],
      "mcps": []
    },
    "librarian": {
      "model": "ollama-cloud/glm-5.1",
      "variant": "low",
      "skills": [],
      "mcps": ["websearch", "context7", "grep_app"]
    },
    "explorer": {
      "model": "ollama-cloud/glm-5.1",
      "variant": "low",
      "skills": [],
      "mcps": []
    },
    "designer": {
      "model": "ollama-cloud/kimi-k2.6",
      "variant": "high",
      "skills": ["agent-browser"],
      "mcps": []
    },
    "fixer": {
      "model": "ollama-cloud/deepseek-v4-pro",
      "variant": "high",
      "skills": [],
      "mcps": []
    }
  }
}
```

- [ ] **Step 3: Verify JSON is valid and preset keys exist**

```bash
node -e "
const c = JSON.parse(require('fs').readFileSync(process.env.HOME+'/.config/opencode/oh-my-opencode-slim.json','utf8'));
const keys = Object.keys(c.presets);
console.log('presets:', keys);
console.assert(keys.includes('custom'), 'custom missing!');
console.assert(keys.includes('openai'), 'openai missing!');
console.assert(keys.includes('github-copilot'), 'github-copilot missing!');
console.assert(keys.includes('ollama-cloud'), 'ollama-cloud missing!');
console.log('council untouched:', JSON.stringify(c.council?.presets?.default?.alpha?.model));
console.log('OK');
"
```

Expected output:
```
presets: [ 'custom', 'openai', 'github-copilot', 'ollama-cloud' ]
council untouched: "ollama-cloud/deepseek-v4-pro"
OK
```

- [ ] **Step 4: Commit**

```bash
git -C ~/.config/opencode add oh-my-opencode-slim.json
git -C ~/.config/opencode commit -m "feat: add openai/github-copilot/ollama-cloud provider presets"
```

---

### Task 2: Create the `provider-switch.mjs` script

**Files:**
- Create: `~/.config/opencode/bin/provider-switch.mjs`

The script atomically updates `preset`, `fallback.chains`, and `manualPlan` for the chosen provider. It never touches `council`, `websearch`, or `presets` definitions.

- [ ] **Step 1: Create the bin directory if missing**

```bash
mkdir -p ~/.config/opencode/bin
```

- [ ] **Step 2: Write the script**

Create `~/.config/opencode/bin/provider-switch.mjs` with this exact content:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const CONFIG_PATH = join(homedir(), '.config/opencode/oh-my-opencode-slim.json');

// Per-provider fallback.chains and manualPlan.
// All model IDs must match keys registered in opencode.json provider section.
const PROVIDER_DATA = {
  openai: {
    fallbackChains: {
      orchestrator: ['openai/gpt-5.5', 'openai/gpt-5-mini'],
      oracle:        ['openai/gpt-5.5', 'openai/gpt-5-mini'],
      designer:      ['openai/gpt-5.5', 'openai/gpt-5-mini'],
      fixer:         ['openai/gpt-5.5', 'openai/gpt-5-mini'],
      librarian:     ['openai/gpt-5-mini'],
      explorer:      ['openai/gpt-5-mini'],
    },
    manualPlan: {
      orchestrator: { primary: 'openai/gpt-5.5', fallback1: 'openai/gpt-5-mini' },
      oracle:        { primary: 'openai/gpt-5.5', fallback1: 'openai/gpt-5-mini' },
      designer:      { primary: 'openai/gpt-5.5', fallback1: 'openai/gpt-5-mini' },
      fixer:         { primary: 'openai/gpt-5.5', fallback1: 'openai/gpt-5-mini' },
      librarian:     { primary: 'openai/gpt-5-mini' },
      explorer:      { primary: 'openai/gpt-5-mini' },
    },
  },
  'github-copilot': {
    fallbackChains: {
      orchestrator: ['github-copilot/claude-sonnet-4.6', 'github-copilot/gpt-5.5', 'github-copilot/gpt-5.4'],
      oracle:        ['github-copilot/claude-opus-4.7',  'github-copilot/gpt-5.5', 'github-copilot/gpt-5.4'],
      designer:      ['github-copilot/claude-opus-4.7',  'github-copilot/gpt-5.5', 'github-copilot/gpt-5.4'],
      fixer:         ['github-copilot/gpt-5.3-codex',    'github-copilot/gpt-5.4', 'github-copilot/gpt-5.5'],
      librarian:     ['github-copilot/gpt-5-mini', 'github-copilot/gpt-5.4'],
      explorer:      ['github-copilot/gpt-5-mini', 'github-copilot/gpt-5.4'],
    },
    manualPlan: {
      orchestrator: { primary: 'github-copilot/claude-sonnet-4.6', fallback1: 'github-copilot/gpt-5.5',     fallback2: 'github-copilot/gpt-5.4' },
      oracle:        { primary: 'github-copilot/claude-opus-4.7',   fallback1: 'github-copilot/gpt-5.5',     fallback2: 'github-copilot/gpt-5.4' },
      designer:      { primary: 'github-copilot/claude-opus-4.7',   fallback1: 'github-copilot/gpt-5.5',     fallback2: 'github-copilot/gpt-5.4' },
      fixer:         { primary: 'github-copilot/gpt-5.3-codex',     fallback1: 'github-copilot/gpt-5.4',     fallback2: 'github-copilot/gpt-5.5' },
      librarian:     { primary: 'github-copilot/gpt-5-mini',        fallback1: 'github-copilot/gpt-5.4' },
      explorer:      { primary: 'github-copilot/gpt-5-mini',        fallback1: 'github-copilot/gpt-5.4' },
    },
  },
  'ollama-cloud': {
    fallbackChains: {
      orchestrator: ['ollama-cloud/deepseek-v4-pro', 'ollama-cloud/kimi-k2.6',    'ollama-cloud/qwen3.5:397b'],
      oracle:        ['ollama-cloud/deepseek-v4-pro', 'ollama-cloud/kimi-k2.6',    'ollama-cloud/qwen3.5:397b'],
      designer:      ['ollama-cloud/kimi-k2.6',        'ollama-cloud/deepseek-v4-pro'],
      fixer:         ['ollama-cloud/deepseek-v4-pro',  'ollama-cloud/kimi-k2.6'],
      librarian:     ['ollama-cloud/glm-5.1',          'ollama-cloud/gemma4:31b'],
      explorer:      ['ollama-cloud/glm-5.1',          'ollama-cloud/gemma4:31b'],
    },
    manualPlan: {
      orchestrator: { primary: 'ollama-cloud/deepseek-v4-pro', fallback1: 'ollama-cloud/kimi-k2.6',   fallback2: 'ollama-cloud/qwen3.5:397b' },
      oracle:        { primary: 'ollama-cloud/deepseek-v4-pro', fallback1: 'ollama-cloud/kimi-k2.6',   fallback2: 'ollama-cloud/qwen3.5:397b' },
      designer:      { primary: 'ollama-cloud/kimi-k2.6',       fallback1: 'ollama-cloud/deepseek-v4-pro' },
      fixer:         { primary: 'ollama-cloud/deepseek-v4-pro', fallback1: 'ollama-cloud/kimi-k2.6' },
      librarian:     { primary: 'ollama-cloud/glm-5.1',         fallback1: 'ollama-cloud/gemma4:31b' },
      explorer:      { primary: 'ollama-cloud/glm-5.1',         fallback1: 'ollama-cloud/gemma4:31b' },
    },
  },
};

function validate(config, provider) {
  if (!config.presets?.[provider]) {
    throw new Error(`Preset "${provider}" not found in config.presets. Available: ${Object.keys(config.presets ?? {}).join(', ')}`);
  }
  if (!PROVIDER_DATA[provider]) {
    throw new Error(`No fallback/manualPlan data for "${provider}" in this script. Add it to PROVIDER_DATA.`);
  }
}

function applyProvider(config, provider) {
  const data = PROVIDER_DATA[provider];
  config.preset = provider;
  // Preserve all existing fallback settings (enabled, timeouts, retry flags)
  // and replace only the chains map.
  if (!config.fallback) config.fallback = {};
  config.fallback.chains = data.fallbackChains;
  config.manualPlan = data.manualPlan;
  return config;
}

async function promptProvider(available) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    console.log('Available providers:');
    available.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    rl.question('Enter provider name or number: ', answer => {
      rl.close();
      const num = parseInt(answer, 10);
      if (!isNaN(num) && num >= 1 && num <= available.length) {
        resolve(available[num - 1]);
      } else {
        resolve(answer.trim());
      }
    });
  });
}

async function main() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const available = Object.keys(config.presets ?? {}).filter(k => k !== 'custom');

  let provider = process.argv[2];

  if (!provider) {
    provider = await promptProvider(available);
  }

  // Validate before writing anything
  validate(config, provider);

  const updated = applyProvider(config, provider);
  const json = JSON.stringify(updated, null, 2) + '\n';

  // Validate round-trip
  JSON.parse(json);

  // Atomic write: tmp -> rename
  const tmp = CONFIG_PATH + '.tmp';
  writeFileSync(tmp, json, 'utf8');
  try {
    renameSync(tmp, CONFIG_PATH);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }

  console.log(`✓ Switched to provider: ${provider}`);
  console.log(`  preset: ${updated.preset}`);
  console.log(`  Reload OpenCode to apply changes.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
```

- [ ] **Step 3: Make it executable**

```bash
chmod +x ~/.config/opencode/bin/provider-switch.mjs
```

- [ ] **Step 4: Smoke-test with a dry run — switch to openai and back**

```bash
# Switch to openai
node ~/.config/opencode/bin/provider-switch.mjs openai
```

Expected:
```
✓ Switched to provider: openai
  preset: openai
  Reload OpenCode to apply changes.
```

Verify the file changed:
```bash
node -e "const c=JSON.parse(require('fs').readFileSync(process.env.HOME+'/.config/opencode/oh-my-opencode-slim.json','utf8')); console.log('preset:', c.preset); console.log('fallback orchestrator:', c.fallback.chains.orchestrator[0]); console.log('council alpha unchanged:', c.council.presets.default.alpha.model)"
```

Expected:
```
preset: openai
fallback orchestrator: openai/gpt-5.5
council alpha unchanged: ollama-cloud/deepseek-v4-pro
```

- [ ] **Step 5: Switch to github-copilot and verify**

```bash
node ~/.config/opencode/bin/provider-switch.mjs github-copilot
node -e "const c=JSON.parse(require('fs').readFileSync(process.env.HOME+'/.config/opencode/oh-my-opencode-slim.json','utf8')); console.log('preset:', c.preset); console.log('fallback fixer[0]:', c.fallback.chains.fixer[0]); console.log('council untouched:', c.council.presets.default.alpha.model)"
```

Expected:
```
preset: github-copilot
fallback fixer[0]: github-copilot/gpt-5.3-codex
council untouched: ollama-cloud/deepseek-v4-pro
```

- [ ] **Step 6: Test unknown provider exits cleanly**

```bash
node ~/.config/opencode/bin/provider-switch.mjs nonexistent 2>&1; echo "exit: $?"
```

Expected:
```
Error: Preset "nonexistent" not found in config.presets. Available: custom, openai, github-copilot, ollama-cloud
exit: 1
```

Verify the file was NOT changed:
```bash
node -e "const c=JSON.parse(require('fs').readFileSync(process.env.HOME+'/.config/opencode/oh-my-opencode-slim.json','utf8')); console.log('preset still:', c.preset)"
```

Expected: `preset still: github-copilot` (unchanged from Step 5)

- [ ] **Step 7: Restore to custom preset, commit**

```bash
node -e "
const fs = require('fs');
const path = process.env.HOME+'/.config/opencode/oh-my-opencode-slim.json';
const c = JSON.parse(fs.readFileSync(path,'utf8'));
c.preset = 'custom';
c.fallback.chains = {
  orchestrator: ['github-copilot/gpt-5.5', 'github-copilot/claude-opus-4.7', 'ollama-cloud/kimi-k2.6'],
  oracle:        ['openai/gpt-5.5', 'github-copilot/gpt-5.3-codex', 'ollama-cloud/kimi-k2.6'],
  librarian:     ['openai/gpt-5-mini', 'github-copilot/gpt-5.5', 'ollama-cloud/glm-5.1'],
  explorer:      ['openai/gpt-5-mini', 'github-copilot/gpt-5.4', 'ollama-cloud/glm-5.1'],
  designer:      ['github-copilot/claude-opus-4.7', 'github-copilot/gpt-5.4', 'ollama-cloud/kimi-k2.6'],
  fixer:         ['github-copilot/gpt-5.4', 'openai/gpt-5.5', 'ollama-cloud/kimi-k2.6'],
};
fs.writeFileSync(path, JSON.stringify(c, null, 2)+'\n');
console.log('Restored to custom');
"
git -C ~/.config/opencode add oh-my-opencode-slim.json bin/provider-switch.mjs
git -C ~/.config/opencode commit -m "feat: add provider-switch.mjs script"
```

---

### Task 3: Create the OpenCode `/provider` slash command

**Files:**
- Create: `~/.config/opencode/commands/provider.md`

This file registers `/provider` as an OpenCode slash command that calls the switch script.

- [ ] **Step 1: Create the commands directory**

```bash
mkdir -p ~/.config/opencode/commands
```

- [ ] **Step 2: Write the command definition**

Create `~/.config/opencode/commands/provider.md` with this content:

```markdown
---
description: Switch active provider for all agent models (openai, github-copilot, ollama-cloud)
---

Switch the active provider in oh-my-opencode-slim.json.

Usage: `/provider [openai|github-copilot|ollama-cloud]`

If no argument is given, show the available providers and prompt for a choice.

Run the switch script:

```bash
node ~/.config/opencode/bin/provider-switch.mjs $ARGUMENTS
```

After the switch completes, tell the user which provider is now active and remind them to reload OpenCode (close and reopen the current session) for the change to take effect.

If the script exits with an error, show the error message to the user. Do not retry or guess.
```

- [ ] **Step 3: Verify the file exists and is well-formed**

```bash
cat ~/.config/opencode/commands/provider.md
```

Expected: the markdown content above with frontmatter and instructions.

- [ ] **Step 4: Commit**

```bash
git -C ~/.config/opencode add commands/provider.md
git -C ~/.config/opencode commit -m "feat: add /provider slash command definition"
```

---

### Task 4: End-to-end validation

- [ ] **Step 1: Reload OpenCode (restart the session)**

Close and reopen OpenCode. This ensures the updated `oh-my-opencode-slim.json` with the new `presets` is loaded fresh.

- [ ] **Step 2: Verify agents and models are visible**

In OpenCode, check that agents (`orchestrator`, `oracle`, `designer`, `fixer`, `librarian`, `explorer`) are all visible with the expected models for the `custom` preset.

- [ ] **Step 3: Run `/provider openai` from the OpenCode chat**

Type in the OpenCode chat:
```
/provider openai
```

Expected: the agent runs the script, reports `✓ Switched to provider: openai` and instructs to reload.

- [ ] **Step 4: Reload and verify models changed**

Restart OpenCode. Confirm:
- Orchestrator model = `openai/gpt-5.5`
- Oracle model = `openai/gpt-5.5`
- Librarian model = `openai/gpt-5-mini`
- Council councillors (alpha/beta/gamma) = **unchanged** from before

- [ ] **Step 5: Switch back to custom**

```bash
node ~/.config/opencode/bin/provider-switch.mjs 2>&1
```

This should show the provider list and prompt interactively. Type `custom` or the number for it.

Or directly:
```bash
node -e "
const fs=require('fs'), p=process.env.HOME+'/.config/opencode/oh-my-opencode-slim.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
c.preset='custom';
fs.writeFileSync(p, JSON.stringify(c,null,2)+'\n');
console.log('back to custom');
"
```

Reload OpenCode and confirm custom preset is active.

- [ ] **Step 6: Final commit and sync**

```bash
git -C ~/.config/opencode add -A
git -C ~/.config/opencode commit -m "chore: verified provider-switch end-to-end"
```

If you use `/sync-push`, run it now so the config syncs across machines.

---

## Notes

**Switching back to the `custom` (mixed-provider) preset:**

`/provider` only works for named provider presets. To restore the `custom` preset manually:

```bash
node -e "
const fs=require('fs'), p=process.env.HOME+'/.config/opencode/oh-my-opencode-slim.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
c.preset='custom';
fs.writeFileSync(p, JSON.stringify(c,null,2)+'\n');
console.log('Restored preset: custom');
"
```

Then restore the original mixed-provider `fallback.chains` and `manualPlan` manually in the JSON if needed (they are preserved in git history).

---

**Adding a new provider later:**

1. Add a `"<provider>": { ... }` preset block to `oh-my-opencode-slim.json` under `presets`.
2. Add a matching entry to `PROVIDER_DATA` in `provider-switch.mjs`.
3. That's it. No other changes needed.

**"Can't see agents / models / variants" bug prevention:**

- The script only modifies `preset`, `fallback.chains`, and `manualPlan`. It never writes into `presets.*` definitions or `council.*`.
- All model IDs used in fallback chains and manualPlan are exactly the same strings as in the confirmed-working preset blocks.
- The script validates that `config.presets[provider]` exists before writing anything.
- Atomic rename ensures the file is never in a partial state.
- If a write fails, the original file is untouched.
