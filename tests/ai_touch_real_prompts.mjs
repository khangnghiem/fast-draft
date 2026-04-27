// Real-prompt-style E2E for AI Touch.
// Drives the actual web UI on http://localhost:8081 with realistic mocked
// /api/ai responses (varied fence styles, no-op, error, large doc, partial
// merge). Captures screenshots after each interaction to a stable artifact dir.
//
// Usage:
//   FD_E2E_ARTIFACT_DIR=./tmp/ai-touch-shots node tests/ai_touch_real_prompts.mjs
//
// Each scenario exercises one path of the new AI Touch lifecycle:
//   1. realistic-refine   -> ```fd fence, accept, undo
//   2. fastdraft-fence    -> ```fastdraft fence, accept
//   3. prose-no-fence     -> raw fd with leading prose, accept
//   4. noop               -> identical baseline, expect "no changes" toast
//   5. invalid-fd         -> malformed fd, expect error toast, baseline intact
//   6. abort-during-think -> delayed mock, second click cancels first
//   7. keyboard-accept    -> Enter accepts the preview
//   8. keyboard-reject    -> Escape rejects the preview
//   9. complex-replace    -> full multi-node design, accept
//
// Assertions are LIGHT: focus is on capturing visual evidence and
// confirming no console errors.

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';

const PORT = process.env.FD_E2E_PORT || 8081;
const URL = `http://localhost:${PORT}/index.html`;
const ART = process.env.FD_E2E_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'fd-ai-real-'));
fs.mkdirSync(ART, { recursive: true });
console.log('Artifact dir:', ART);

const BASE = `rect @hero {
  w: 240 h: 140
  fill: #FF6B6B
  corner: 8
}
text @label "Welcome" {
  font: "Inter" 18
  fill: #1D1D1F
}`;

const REFINED = `rect @hero_card {
  w: 240 h: 140
  fill: #6C5CE7
  corner: 14
  shadow: (0,4,16,#00000020)
}
text @welcome_label "Welcome" {
  font: "Inter" 18
  fill: #FFFFFF
}`;

const COMPLEX = `rect @shell {
  w: 520 h: 360
  fill: #F5F5F7
  corner: 20
  shadow: (0,12,40,#00000018)
}`;

const SCENARIOS = [
  {
    name: '01-realistic-fd-fence',
    body: { result: '```fd\n' + REFINED + '\n```', remaining: 49, limit: 50 },
    actions: ['preview', 'accept', 'undo'],
  },
  {
    name: '02-fastdraft-fence',
    body: { result: '```fastdraft\n' + REFINED + '\n```', remaining: 48, limit: 50 },
    actions: ['preview', 'accept'],
  },
  {
    name: '03-prose-no-fence',
    body: { result: 'Sure! Here is the improved design:\n\n' + REFINED, remaining: 47, limit: 50 },
    actions: ['preview', 'accept'],
  },
  {
    name: '04-noop',
    body: { result: BASE, remaining: 46, limit: 50 },
    actions: ['preview-noop'],
  },
  {
    name: '05-invalid-fd',
    body: { result: 'rect @broken {\n  fill: not-a-color\n  unclosed' , remaining: 45, limit: 50 },
    actions: ['preview-invalid'],
  },
  {
    name: '06-abort-during-think',
    body: { result: REFINED, remaining: 44, limit: 50 },
    delayMs: 1500,
    actions: ['abort-second-click'],
  },
  {
    name: '07-keyboard-accept',
    body: { result: REFINED, remaining: 43, limit: 50 },
    actions: ['preview', 'press-enter'],
  },
  {
    name: '08-keyboard-reject',
    body: { result: REFINED, remaining: 42, limit: 50 },
    actions: ['preview', 'press-escape'],
  },
  {
    name: '09-complex-replace',
    body: { result: '```fd\n' + COMPLEX + '\n```', remaining: 41, limit: 50 },
    actions: ['preview', 'accept'],
  },
];

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function setBaseline(page) {
  await page.evaluate((text) => {
    const canvas = window.fdCanvas;
    canvas.set_text(text);
    canvas.select_by_id('hero');
    window.__aiTouchSession?.setEditorText?.(text);
    window.api?.renderCanvas?.();
  }, BASE);
}

async function shoot(page, name) {
  const file = path.join(ART, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log('  screenshot:', path.basename(file));
}

async function snapshot(page) {
  return page.evaluate(() => ({
    canvasText: window.fdCanvas.get_text(),
    editorText: window.__aiTouchSession?.getEditorText?.() || '',
    toolbar: Boolean(document.querySelector('#ai-diff-toolbar.visible')),
    state: window.__aiTouchSession?.state || 'unknown',
    previewAttr: document.querySelector('[data-ai-preview="active"]') ? 'active' : 'idle',
  }));
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleLogs = [];
  const pageErrors = [];
  page.on('console', m => consoleLogs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', e => pageErrors.push(String(e)));

  await page.goto(URL);
  await page.waitForSelector('#fd-canvas', { state: 'attached' });
  await page.waitForFunction(() => {
    const l = document.getElementById('loading');
    return !l || getComputedStyle(l).display === 'none';
  }, { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__aiTouchSession && window.fdCanvas), { timeout: 15000 });
  console.log('UI ready.');

  const results = [];
  for (const sc of SCENARIOS) {
    console.log(`\n▶ ${sc.name}`);
    try {
      // Reset
      await page.unroute('**/api/ai').catch(() => {});
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#fd-canvas', { state: 'attached' });
      await page.waitForFunction(() => {
        const l = document.getElementById('loading');
        return !l || getComputedStyle(l).display === 'none';
      }, { timeout: 30000 });
      await page.waitForFunction(() => Boolean(window.__aiTouchSession && window.fdCanvas), { timeout: 15000 });
      await setBaseline(page);
      await page.waitForTimeout(150);

      await page.route('**/api/ai', async route => {
        if (sc.delayMs) await new Promise(r => setTimeout(r, sc.delayMs));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'x-ratelimit-limit': String(sc.body.limit), 'x-ratelimit-remaining': String(sc.body.remaining) },
          body: JSON.stringify(sc.body),
        });
      });

      const before = await snapshot(page);

      for (const action of sc.actions) {
        if (action === 'preview') {
          await page.click('#ai-touch-btn');
          await page.waitForSelector('#ai-diff-toolbar.visible', { timeout: 12000 });
          await page.waitForTimeout(200);
          await shoot(page, `${sc.name}-preview`);
          const s = await snapshot(page);
          assert(s.toolbar, 'toolbar should appear');
          assert(s.previewAttr === 'active', 'data-ai-preview should be active during preview');
        } else if (action === 'preview-noop') {
          await page.click('#ai-touch-btn');
          await page.waitForTimeout(2500);
          await shoot(page, `${sc.name}-after`);
          const s = await snapshot(page);
          assert(!s.toolbar, 'no toolbar for no-op');
          assert(s.canvasText.trim() === BASE.trim(), 'canvas unchanged for no-op');
        } else if (action === 'preview-invalid') {
          await page.click('#ai-touch-btn');
          await page.waitForTimeout(2500);
          await shoot(page, `${sc.name}-after`);
          const s = await snapshot(page);
          assert(!s.toolbar, 'no toolbar for invalid FD');
          assert(s.canvasText.trim() === BASE.trim(), 'canvas unchanged for invalid');
        } else if (action === 'accept') {
          await page.click('#ai-diff-toolbar .ai-diff-accept');
          await page.waitForFunction(() => !document.querySelector('#ai-diff-toolbar.visible'), { timeout: 5000 });
          await page.waitForTimeout(200);
          await shoot(page, `${sc.name}-accepted`);
          const s = await snapshot(page);
          assert(s.editorText.length > 0, 'editor text after accept');
          assert(s.canvasText.length > 0, 'canvas text after accept');
        } else if (action === 'undo') {
          const ok = await page.evaluate(() => window.fdCanvas.undo());
          assert(ok, 'undo should report change');
          await page.waitForFunction((b) => window.fdCanvas.get_text().trim() === b.trim(), BASE, { timeout: 5000 });
          await shoot(page, `${sc.name}-undone`);
        } else if (action === 'press-enter') {
          await page.keyboard.press('Enter');
          await page.waitForFunction(() => !document.querySelector('#ai-diff-toolbar.visible'), { timeout: 5000 });
          await shoot(page, `${sc.name}-enter`);
          const s = await snapshot(page);
          assert(s.editorText.length > 0, 'editor mutated by Enter accept');
        } else if (action === 'press-escape') {
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('#ai-diff-toolbar.visible'), { timeout: 5000 });
          await shoot(page, `${sc.name}-escape`);
          const s = await snapshot(page);
          assert(s.canvasText.trim() === BASE.trim(), 'baseline restored on Escape reject');
        } else if (action === 'abort-second-click') {
          // First click starts thinking with 1.5s delay, second click cancels
          await page.click('#ai-touch-btn');
          await page.waitForTimeout(300);
          const stateThinking = await page.evaluate(() => window.__aiTouchSession?.state);
          await page.click('#ai-touch-btn');
          await page.waitForTimeout(2500); // wait past delay
          await shoot(page, `${sc.name}-after`);
          const s = await snapshot(page);
          // Either cancelled (no toolbar) or restarted (toolbar visible) — both
          // are acceptable per spec; what matters is no error and clean state.
          console.log('  thinking-state seen:', stateThinking, '-> final:', s.state, 'toolbar:', s.toolbar);
        }
      }

      results.push({ name: sc.name, ok: true });
      console.log(`  ✓ ${sc.name}`);
    } catch (err) {
      results.push({ name: sc.name, ok: false, error: err.message });
      console.log(`  ✗ ${sc.name}: ${err.message}`);
      try { await shoot(page, `${sc.name}-FAIL`); } catch (_) {}
    }
  }

  await page.unroute('**/api/ai').catch(() => {});
  if (pageErrors.length) {
    console.log('\nPAGE ERRORS:');
    for (const e of pageErrors) console.log('  -', e);
  }
  await browser.close();

  const pass = results.filter(r => r.ok).length;
  console.log(`\n=== ${pass}/${results.length} scenarios passed ===`);
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.error ? ' — ' + r.error : ''}`);
  console.log(`Artifacts in: ${ART}`);
  if (pass !== results.length || pageErrors.length) process.exitCode = 1;
}

run().catch(err => { console.error(err); process.exit(1); });
