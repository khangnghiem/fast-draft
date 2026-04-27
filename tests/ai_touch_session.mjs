import { chromium } from 'playwright';
import path from 'path';
import http from 'http';
import fs from 'fs';
import os from 'os';

const BASELINE = `rect @hero {
  w: 120 h: 80
  fill: #FF0000
}`;

const CANDIDATE = `rect @hero {
  w: 120 h: 80
  fill: #00FF00
}`;

const DRIFTED_PREVIEW = `rect @hero {
  w: 120 h: 80
  fill: #0000FF
}`;

const PORT_START = Number.parseInt(process.env.FD_E2E_PORT || '8094', 10);
const PORT_MAX = 8194;

function createServer() {
  return http.createServer((req, res) => {
    const rawPath = (req.url === '/' ? 'index.html' : req.url.split('?')[0]).replace(/^\/+/, '');
    const siteRoot = path.resolve('site');
    const filePath = path.resolve(siteRoot, rawPath);
    const inSiteRoot = filePath === siteRoot || filePath.startsWith(`${siteRoot}${path.sep}`);
    if (!inSiteRoot || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const mime = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.wasm': 'application/wasm',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
    }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
  });
}

async function startServer(portStart = PORT_START, portMax = PORT_MAX) {
  for (let port = portStart; port <= portMax; port++) {
    const server = createServer();
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, resolve);
      });
      return { server, port };
    } catch (error) {
      server.close();
      if (error?.code !== 'EADDRINUSE' || port === portMax) throw error;
    }
  }
  throw new Error(`No available port in range ${portStart}-${portMax}`);
}

async function waitReady(page, port) {
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForSelector('#fd-canvas', { state: 'attached' });
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading');
    return !loading || getComputedStyle(loading).display === 'none';
  }, { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__aiTouchSession && window.fdCanvas), { timeout: 10000 });
}

async function setBaseline(page, text = BASELINE) {
  await page.evaluate((baselineText) => {
    window.__aiTouchSession?.cancel?.();
    const canvas = window.api?.getFdCanvas?.() || window.fdCanvas;
    canvas.set_text(baselineText);
    canvas.select_by_id('hero');
    window.__aiTouchSession?.setEditorText?.(baselineText);
    window.api?.renderCanvas?.();
  }, text);
  await page.waitForTimeout(50);
}

async function textState(page) {
  return page.evaluate(() => ({
    canvasText: (window.api?.getFdCanvas?.() || window.fdCanvas).get_text(),
    editorText: window.__aiTouchSession?.getEditorText?.() || '',
    toolbarVisible: Boolean(document.querySelector('#ai-diff-toolbar.visible')),
  }));
}

async function sessionState(page) {
  return page.evaluate(() => {
    const session = window.__aiTouchSession;
    const canvas = document.getElementById('fd-canvas');
    const toolbar = document.querySelector('#ai-diff-toolbar');
    const toolbarParent = toolbar?.parentElement;
    return {
      state: session?.state,
      hasActive: Boolean(session?.active),
      toolbarCount: document.querySelectorAll('#ai-diff-toolbar').length,
      toolbarVisible: Boolean(document.querySelector('#ai-diff-toolbar.visible')),
      toolbarParentId: toolbarParent?.id || '',
      toolbarParentTag: toolbarParent?.tagName || '',
      previewAttr: canvas?.getAttribute('data-ai-preview') || '',
      toastText: Array.from(document.querySelectorAll('.fd-toast')).map((el) => el.textContent || '').join(' | '),
    };
  });
}

async function waitForToast(page, text, timeout = 4000) {
  await page.waitForFunction((needle) => {
    return Array.from(document.querySelectorAll('.fd-toast')).some((el) =>
      String(el.textContent || '').includes(needle)
    );
  }, text, { timeout });
}

async function useAiMock(page, handler) {
  await page.unroute('**/api/ai').catch(() => {});
  await page.route('**/api/ai', handler);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  let browser = null;
  let server = null;
  let serverPort = null;
  const consoleLogs = [];
  const pageErrors = [];
  const artifactDir = process.env.FD_E2E_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'fd-ai-touch-'));
  const consoleErrorCount = () => consoleLogs.filter((line) => line.startsWith('error:')).length;

  try {
    const started = await startServer();
    server = started.server;
    serverPort = started.port;
    await new Promise((resolve) => setTimeout(resolve, 300));
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
    page.on('console', (msg) => consoleLogs.push(`${msg.type()}: ${msg.text()}`));
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    console.log(`AI Touch E2E server port: ${serverPort}`);
    await useAiMock(page, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-ratelimit-limit': '50', 'x-ratelimit-remaining': '49' },
      body: JSON.stringify({ result: CANDIDATE, remaining: 49, limit: 50 }),
    }));

    await waitReady(page, serverPort);
    await setBaseline(page);

    // Case 0: stripMarkdownFences tolerant parsing variants
    const stripResults = await page.evaluate(async () => {
      const { stripMarkdownFences } = await import('./canvas-core/ai-touch/session.js?v=0.11.385');
      const { computeSmartMerge } = await import('./ai-chat.js?v=0.11.385');
      return {
        fastdraft: stripMarkdownFences('```fastdraft\nrect @a { w: 10 h: 10 }\n```'),
        textFence: stripMarkdownFences('```text\nframe @a {\n  w: 10 h: 10\n}\n```'),
        plainFence: stripMarkdownFences('```plain\ntext @label "Hi"\n```'),
        prosePrefix: stripMarkdownFences('Sure — here is your update:\n\nrect @hero {\n  w: 120 h: 80\n  fill: #00FF00\n}'),
        mergeReplace: computeSmartMerge(
          'rect @hero {\n  w: 120 h: 80\n  fill: #FF0000\n}\n\ntext @title "Old"',
          'rect @hero {\n  w: 120 h: 80\n  fill: #00FF00\n}'
        ),
        mergeAppend: computeSmartMerge('rect @hero {\n  w: 120 h: 80\n}', 'text @subtitle "Hi"'),
      };
    });
    assert(stripResults.fastdraft.startsWith('rect @a'), 'stripMarkdownFences should parse ```fastdraft fences');
    assert(stripResults.textFence.startsWith('frame @a'), 'stripMarkdownFences should parse ```text fences');
    assert(stripResults.plainFence.startsWith('text @label'), 'stripMarkdownFences should parse ```plain fences');
    assert(stripResults.prosePrefix.startsWith('rect @hero'), 'stripMarkdownFences should strip prose before FD code');
    assert(stripResults.mergeReplace.includes('fill: #00FF00'), 'computeSmartMerge should replace existing matching @id blocks');
    assert(stripResults.mergeReplace.includes('text @title "Old"'), 'computeSmartMerge should preserve non-target blocks');
    assert(stripResults.mergeAppend.includes('text @subtitle "Hi"'), 'computeSmartMerge should append new unmatched blocks');

    // Case 1: No-op response should not show toolbar and should show friendly toast
    await useAiMock(page, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: `\n${BASELINE}\n` }),
    }));
    await setBaseline(page);
    await page.click('#ai-touch-btn');
    await page.waitForFunction(() => window.__aiTouchSession?.state === 'idle', { timeout: 10000 });
    await waitForToast(page, 'AI returned no changes — try a different prompt');
    let state = await sessionState(page);
    assert(!state.toolbarVisible, 'no-op response must not show preview toolbar');
    assert(state.state === 'idle', 'no-op response must return session to idle');
    const noOpText = await textState(page);
    assert(noOpText.canvasText === BASELINE, 'no-op response must keep baseline canvas text');

    // Case 2: Abort while thinking by clicking AI Touch again
    await useAiMock(page, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ result: CANDIDATE }),
        });
      } catch (_) {
        // Request may be aborted by client; ignore.
      }
    });
    await setBaseline(page);
    const errorsBeforeAbort = pageErrors.length;
    const consoleErrorsBeforeAbort = consoleErrorCount();
    await page.click('#ai-touch-btn');
    await page.waitForTimeout(120);
    await page.click('#ai-touch-btn');
    await waitForToast(page, 'AI Touch cancelled');
    await page.waitForTimeout(1400);
    state = await sessionState(page);
    assert(!state.toolbarVisible, 'abort-while-thinking must not leave toolbar visible');
    assert(state.state === 'idle', 'abort-while-thinking must return to idle state');
    assert(!state.hasActive, 'abort-while-thinking must clear active preview state');
    const abortState = await textState(page);
    assert(abortState.canvasText === BASELINE, 'abort-while-thinking must keep baseline canvas text');
    assert(pageErrors.length === errorsBeforeAbort, 'abort-while-thinking must not trigger page errors');
    assert(consoleErrorCount() === consoleErrorsBeforeAbort, 'abort-while-thinking must not emit new console errors');

    // Case 3: Two rapid clicks (while previewing) should not duplicate requests/toolbars
    let requestCount = 0;
    await useAiMock(page, (route) => {
      requestCount += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: CANDIDATE }),
      });
    });
    await setBaseline(page);
    await page.click('#ai-touch-btn');
    await page.waitForSelector('#ai-diff-toolbar.visible', { timeout: 10000 });
    await page.click('#ai-touch-btn');
    await page.waitForTimeout(200);
    state = await sessionState(page);
    assert(requestCount === 1, 'two rapid clicks should issue only one AI request while previewing');
    assert(state.toolbarCount === 1, 'two rapid clicks should keep exactly one toolbar instance');
    assert(state.toolbarParentTag !== 'BODY', 'AI toolbar should be anchored to canvas pane container, not body');
    assert(state.previewAttr === 'active', 'preview should set data-ai-preview="active" on canvas root');
    const rapidState = await textState(page);
    assert(rapidState.canvasText.includes('#00FF00'), 'rapid-click preview should apply candidate once');
    await page.click('#ai-diff-toolbar .ai-diff-reject');
    await page.waitForFunction(() => !document.querySelector('#ai-diff-toolbar.visible'));
    state = await sessionState(page);
    assert(!state.previewAttr, 'reject should clear data-ai-preview attribute');

    // Case 4: Keyboard shortcuts Escape reject / Enter accept
    await useAiMock(page, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: CANDIDATE }),
    }));
    await setBaseline(page);
    await page.click('#ai-touch-btn');
    await page.waitForSelector('#ai-diff-toolbar.visible', { timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#ai-diff-toolbar.visible'));
    state = await textState(page);
    assert(state.canvasText === BASELINE, 'Escape should reject preview and restore baseline');
    state = await sessionState(page);
    assert(!state.previewAttr, 'Escape reject should clear preview attribute');

    await page.click('#ai-touch-btn');
    await page.waitForSelector('#ai-diff-toolbar.visible', { timeout: 10000 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('#ai-diff-toolbar.visible'));
    state = await textState(page);
    assert(state.canvasText.includes('#00FF00'), 'Enter should accept preview');
    assert(state.editorText.includes('#00FF00'), 'Enter should commit candidate to editor');
    state = await sessionState(page);
    assert(!state.previewAttr, 'Enter accept should clear preview attribute');

    // Case 5: Reject failure forces local reset (no stuck toolbar)
    await setBaseline(page);
    await page.click('#ai-touch-btn');
    await page.waitForSelector('#ai-diff-toolbar.visible', { timeout: 10000 });
    await page.evaluate(() => {
      const canvas = window.api?.getFdCanvas?.() || window.fdCanvas;
      if (!canvas.__originalAiDiscardPreview) {
        canvas.__originalAiDiscardPreview = canvas.ai_discard_preview;
      }
      canvas.ai_discard_preview = () => false;
    });
    await page.click('#ai-diff-toolbar .ai-diff-reject');
    await waitForToast(page, 'AI Touch: forced reset — please reload if canvas looks wrong');
    state = await sessionState(page);
    assert(state.state === 'idle', 'reject failure should force idle state reset');
    assert(!state.hasActive, 'reject failure should clear active session');
    assert(!state.toolbarVisible, 'reject failure should hide toolbar');
    await page.evaluate(() => {
      const canvas = window.api?.getFdCanvas?.() || window.fdCanvas;
      if (canvas.__originalAiDiscardPreview) {
        canvas.ai_discard_preview = canvas.__originalAiDiscardPreview;
      }
    });

    // Existing lifecycle guard: drift during preview blocks accept
    await setBaseline(page);
    await page.click('#ai-touch-btn');
    await page.waitForSelector('#ai-diff-toolbar.visible', { timeout: 10000 });
    state = await textState(page);
    assert(state.canvasText.includes('#00FF00'), 'preview should update canvas text');
    assert(!state.editorText.includes('#00FF00'), 'preview should not mutate editor text before accept');
    assert(state.toolbarVisible, 'preview toolbar should be visible');
    const screenshotPath = path.join(artifactDir, 'ai-touch-preview.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`AI Touch preview screenshot: ${screenshotPath}`);

    await page.evaluate((text) => (window.api?.getFdCanvas?.() || window.fdCanvas).set_text(text), DRIFTED_PREVIEW);
    await page.click('#ai-diff-toolbar .ai-diff-accept');
    await page.waitForTimeout(200);
    state = await textState(page);
    assert(!state.editorText.includes('#00FF00'), 'accept should refuse when canvas changed during preview');
    assert(state.toolbarVisible, 'failed accept should keep preview toolbar visible for recovery');

    await page.click('#ai-diff-toolbar .ai-diff-reject');
    await page.waitForFunction(() => !document.querySelector('#ai-diff-toolbar.visible'));
    state = await textState(page);
    assert(state.canvasText === BASELINE, 'reject should restore baseline canvas text');

    await page.click('#ai-touch-btn');
    await page.waitForSelector('#ai-diff-toolbar.visible', { timeout: 10000 });
    await page.click('#ai-diff-toolbar .ai-diff-accept');
    await page.waitForFunction(() => (window.api?.getFdCanvas?.() || window.fdCanvas).get_text().includes('#00FF00'));
    state = await textState(page);
    assert(state.canvasText.includes('#00FF00'), 'accept should keep candidate canvas text');
    assert(state.editorText.includes('#00FF00'), 'accept should commit candidate to editor');

    const undoChanged = await page.evaluate(() => (window.api?.getFdCanvas?.() || window.fdCanvas).undo());
    assert(undoChanged, 'undo should report an AI Touch snapshot change');
    await page.waitForFunction((baseline) => (window.api?.getFdCanvas?.() || window.fdCanvas).get_text() === baseline, BASELINE);
    state = await textState(page);
    assert(state.canvasText === BASELINE, 'undo should restore baseline after accepted AI Touch');

    await useAiMock(page, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: 'rect @broken {' }),
    }));
    await setBaseline(page);
    await page.click('#ai-touch-btn');
    await page.waitForTimeout(400);
    state = await textState(page);
    assert(state.canvasText === BASELINE, 'invalid FD response should leave baseline unchanged');

    if (pageErrors.length > 0) throw new Error(`Page errors: ${pageErrors.join('\n')}`);
    console.log('✅ AI Touch session E2E passed');
  } catch (err) {
    console.error('❌ AI Touch session E2E failed:', err.message);
    console.error(consoleLogs.join('\n'));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }
})();
