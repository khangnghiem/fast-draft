import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const screenshotsDir = join(repoRoot, 'tests', 'screenshots');

export function startServer(port) {
  const serverProcess = spawn('npx', ['serve', 'site', '-l', String(port)], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
  });
  serverProcess.unref();
  return serverProcess;
}

export async function stopServer(serverProcess) {
  if (!serverProcess?.pid) return;
  try {
    process.kill(-serverProcess.pid, 'SIGTERM');
  } catch {
    try {
      serverProcess.kill('SIGTERM');
    } catch {}
  }
  await new Promise(resolve => setTimeout(resolve, 300));
}

export async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  return page;
}

export async function loadFdContent(page, fdText) {
  await page.locator('.lp-tab[data-tab="code"]').click().catch(() => {});
  await page.waitForTimeout(250);
  const loaded = await page.evaluate((text) => {
    const content = document.querySelector('.cm-content');
    const view = content?.cmView?.view || content?.closest('.cm-editor')?.cmView?.view || null;
    if (!view) return false;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: text.length, head: text.length },
      scrollIntoView: true,
    });
    return true;
  }, fdText);

  if (!loaded) {
    const editor = page.locator('.cm-content').first();
    await editor.click({ force: true });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.type(fdText);
  }
}

export async function dblClickTextNode(page, x, y) {
  await page.mouse.dblclick(x, y);
}

export async function getTextareaPosition(page) {
  return await page.evaluate(() => {
    const textarea = document.querySelector('#canvas-content textarea');
    if (!textarea) return null;
    const rect = textarea.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });
}

export async function closeInlineEditor(page) {
  await page.keyboard.press('Escape');
}

export async function screenshot(page, name) {
  mkdirSync(screenshotsDir, { recursive: true });
  const filePath = join(screenshotsDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

export async function waitForWasmReady(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#fd-canvas');
    return !!canvas && canvas.width > 0 && canvas.height > 0;
  }, { timeout: 15000 });
}

export async function runSmokeTest() {
  const server = startServer(8081);
  await waitForServerReady(['http://localhost:8081/index.html', 'http://localhost:8081/site/index.html']);
  const browser = await chromium.launch();
  const page = await openPage(browser, 'http://localhost:8081/index.html');

  try {
    await waitForWasmReady(page);
    await loadFdContent(page, 'text @hello "Hello" {\n  x: 120\n  y: 120\n}');
    await page.waitForTimeout(1000);

    const canvasBox = await page.locator('#fd-canvas').boundingBox();
    if (!canvasBox) throw new Error('canvas not found');

    await dblClickTextNode(page, canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await page.waitForFunction(() => !!document.querySelector('#canvas-content textarea'));

    const textareaPos = await getTextareaPosition(page);
    if (!textareaPos) throw new Error('inline editor textarea not visible');

    return textareaPos;
  } finally {
    await closeInlineEditor(page).catch(() => {});
    await browser.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }
}

async function waitForServerReady(urls) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    for (const url of urls) {
      try {
        const res = await fetch(url, { method: 'GET', redirect: 'manual' });
        if (res.ok || (res.status >= 300 && res.status < 400)) return;
      } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`server not ready: ${urls.join(', ')}`);
}

if (import.meta.url === `file://${__filename}`) {
  runSmokeTest()
    .then(() => console.log('inline edit harness smoke test passed'))
    .catch(err => {
      console.error(err);
      process.exitCode = 1;
    });
}
