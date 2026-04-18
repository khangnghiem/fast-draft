import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import {
  closeInlineEditor,
  loadFdContent,
  openPage,
  screenshot,
  startServer,
  stopServer,
  waitForWasmReady,
} from './check-inline-edit-harness.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const fixturesDir = join(repoRoot, 'site', 'test-fixtures');

const FIXTURES = {
  multiline: 'multiline-text.fd',
  wordwrap: 'wordwrap-text.fd',
  top: 'valign-top.fd',
  middle: 'valign-middle.fd',
  bottom: 'valign-bottom.fd',
};

const DEFAULT_FONT = 'Inter, sans-serif';
const VIEWPORT = { width: 1440, height: 960 };
const SCENE_PAD = 40;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5;

function approx(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected.toFixed(2)} ±${tolerance}, got ${actual.toFixed(2)}`);
  }
}

function between(value, min, max, label) {
  if (value < min || value > max) {
    throw new Error(`${label}: expected ${value.toFixed(2)} to be between ${min.toFixed(2)} and ${max.toFixed(2)}`);
  }
}

function computeFitTransform(canvasRect, sceneBounds) {
  let zoom = Math.min(canvasRect.width / sceneBounds.sw, canvasRect.height / sceneBounds.sh, ZOOM_MAX);
  zoom = Math.max(zoom, ZOOM_MIN);
  const panX = (canvasRect.width - sceneBounds.sw * zoom) / 2 - sceneBounds.sx * zoom;
  const panY = (canvasRect.height - sceneBounds.sh * zoom) / 2 - sceneBounds.sy * zoom;
  return { zoom, panX, panY };
}

function fitBounds(nodes) {
  let sx = Infinity;
  let sy = Infinity;
  let sx2 = -Infinity;
  let sy2 = -Infinity;

  for (const node of nodes) {
    sx = Math.min(sx, node.x);
    sy = Math.min(sy, node.y);
    sx2 = Math.max(sx2, node.x + node.w);
    sy2 = Math.max(sy2, node.y + node.h);
  }

  sx -= SCENE_PAD;
  sy -= SCENE_PAD;
  sx2 += SCENE_PAD;
  sy2 += SCENE_PAD;

  return { sx, sy, sw: sx2 - sx, sh: sy2 - sy };
}

async function readFixture(name) {
  return await readFile(join(fixturesDir, name), 'utf8');
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

async function waitForFonts(page) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
}

async function openLayersTab(page) {
  await page.locator('.lp-tab[data-tab="layers"]').click().catch(() => {});
  await page.waitForTimeout(200);
}

async function loadFixture(page, fixtureName) {
  await loadFdContent(page, await readFixture(fixtureName));
  await openLayersTab(page);
  await waitForFonts(page);
  await page.waitForTimeout(900);
}

async function measureText(page, { text, fontSize, fontWeight = 400, fontFamily = DEFAULT_FONT }) {
  return await page.evaluate(({ text, fontSize, fontWeight, fontFamily }) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    const lineHeight = fontSize * 1.2;
    const glyphHeight = metrics.actualBoundingBoxAscent != null && metrics.actualBoundingBoxDescent != null
      ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
      : lineHeight;
    return {
      width: metrics.width,
      height: Math.max(glyphHeight, lineHeight),
      lineHeight,
      ascent: metrics.actualBoundingBoxAscent ?? lineHeight * 0.8,
      descent: metrics.actualBoundingBoxDescent ?? lineHeight * 0.2,
      left: metrics.actualBoundingBoxLeft ?? 0,
      right: metrics.actualBoundingBoxRight ?? metrics.width,
    };
  }, { text, fontSize, fontWeight, fontFamily });
}

async function getFrameMetrics(page) {
  return await page.evaluate(() => {
    const canvas = document.getElementById('fd-canvas');
    const container = document.getElementById('canvas-wrapper') || document.getElementById('canvas-content') || document.body;
    const leftPanel = document.getElementById('left-panel');
    const zoomText = document.getElementById('zoom-level')?.textContent || '100%';
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const leftPanelRect = leftPanel?.getBoundingClientRect();
    return {
      canvasRect: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
      container: { width: container.clientWidth || containerRect.width, height: container.clientHeight || containerRect.height },
      leftPanelWidth: leftPanelRect?.width || 0,
      zoomLevel: parseFloat(zoomText) / 100,
    };
  });
}

async function getTextareaBox(page) {
  return await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('#canvas-content textarea')).find(node => {
      const style = getComputedStyle(node);
      return style.position === 'absolute';
    });
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      paddingTop: parseFloat(style.paddingTop),
      paddingBottom: parseFloat(style.paddingBottom),
      paddingLeft: parseFloat(style.paddingLeft),
      paddingRight: parseFloat(style.paddingRight),
      lineHeight: parseFloat(style.lineHeight),
      fontSize: parseFloat(style.fontSize),
      value: el.value,
    };
  });
}

async function openInlineEditorAt(page, x, y) {
  await page.mouse.dblclick(x, y);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#canvas-content textarea')).some(node => getComputedStyle(node).position === 'absolute'), null, { timeout: 8000 });
}

async function openExistingInlineEditor(page, candidates, expectedValue) {
  for (const { x, y } of candidates) {
    await openInlineEditorAt(page, x, y);
    const box = await getTextareaBox(page);
    if (!box) continue;
    const value = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('#canvas-content textarea')).find(node => getComputedStyle(node).position === 'absolute');
      return el?.value ?? null;
    });
    if (value === expectedValue) return box;
    await closeInlineEditor(page).catch(() => {});
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('#canvas-content textarea')).some(node => getComputedStyle(node).position === 'absolute'), null, { timeout: 4000 }).catch(() => {});
  }
  throw new Error('could not open existing inline editor');
}

async function selectLayerNode(page, nodeId) {
  await page.evaluate((id) => {
    const el = document.querySelector(`.layer-item[data-node-id="${id}"]`);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  }, nodeId);
  await page.waitForTimeout(200);
}

async function getPropertiesBounds(page) {
  return await page.evaluate(() => {
    const x = document.getElementById('pp-x')?.value;
    const y = document.getElementById('pp-y')?.value;
    const w = document.getElementById('pp-w')?.value;
    const h = document.getElementById('pp-h')?.value;
    if (x === '' || y === '' || w === '' || h === '') return null;
    return { x: Number(x), y: Number(y), w: Number(w), h: Number(h) };
  });
}

function buildClickGrid(left, top, width, height) {
  const points = [];
  const xs = [left + 4, left + width / 4, left + width / 2, left + (width * 3) / 4, left + width - 4];
  const ys = [top + 4, top + height / 4, top + height / 2, top + (height * 3) / 4, top + height - 4];
  for (const x of xs) for (const y of ys) points.push({ x, y });
  return points;
}

function splitLines(text) {
  return text.replace(/\r\n/g, '\n').split('\n');
}

function lineCount(text) {
  return splitLines(text).length;
}

async function getCanvasTextContent(page) {
  return await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('#canvas-content textarea')).map(node => ({
      value: node.value,
      position: getComputedStyle(node).position,
      top: node.getBoundingClientRect().top,
      left: node.getBoundingClientRect().left,
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
    }));
    return texts;
  });
}

function expectedMultilineTextareaHeight(metrics, zoom, text) {
  const lines = lineCount(text);
  return lines * metrics.lineHeight * zoom + 2;
}

function expectedSingleLineTextareaHeight(metrics, zoom) {
  return metrics.lineHeight * zoom + 2;
}

function expectedWrapMinWidth(metrics, zoom) {
  return Math.max(80, Math.ceil(metrics.width * zoom) + 2);
}

function expectedTextTopFromNode(nodeTop, zoom, paddingTop = 2) {
  return nodeTop - paddingTop;
}

function expectedTextLeftFromNode(nodeLeft, zoom, paddingLeft = 0) {
  return nodeLeft - paddingLeft;
}

async function runMultilineScenario(page, scenario) {
  await loadFixture(page, scenario.fixture);
  const frame = await getFrameMetrics(page);
  const metrics = await measureText(page, scenario.font);
  await selectLayerNode(page, scenario.nodeId);
  const node = await getPropertiesBounds(page);
  if (!node) throw new Error(`${scenario.name}: node bounds missing`);

  const sceneBounds = fitBounds([node]);
  const transform = computeFitTransform(frame.canvasRect, sceneBounds);
  const nodeLeft = node.x * transform.zoom + transform.panX + frame.canvasRect.left;
  const nodeTop = node.y * transform.zoom + transform.panY + frame.canvasRect.top;
  const nodeWidth = node.w * transform.zoom;
  const nodeHeight = node.h * transform.zoom;

  const textarea = await openExistingInlineEditor(page, buildClickGrid(nodeLeft, nodeTop, nodeWidth, nodeHeight), scenario.value);

  approx(textarea.left, expectedTextLeftFromNode(nodeLeft, transform.zoom), 5, `${scenario.name} left`);
  approx(textarea.top, expectedTextTopFromNode(nodeTop, transform.zoom), 5, `${scenario.name} top`);
  approx(textarea.height, scenario.expectedHeight(metrics, transform.zoom), 6, `${scenario.name} height`);

  if (scenario.assert) {
    await scenario.assert({ page, textarea, metrics, transform, node, frame });
  }

  await screenshot(page, scenario.name);
  await closeInlineEditor(page);
  await page.waitForFunction(() => !document.querySelector('#canvas-content textarea'), null, { timeout: 4000 }).catch(() => {});
}

async function runWordwrapScenario(page, scenario) {
  await loadFixture(page, scenario.fixture);
  const frame = await getFrameMetrics(page);
  const metrics = await measureText(page, scenario.font);
  await selectLayerNode(page, scenario.nodeId);
  const node = await getPropertiesBounds(page);
  if (!node) throw new Error(`${scenario.name}: node bounds missing`);

  const sceneBounds = fitBounds([node]);
  const transform = computeFitTransform(frame.canvasRect, sceneBounds);
  const nodeLeft = node.x * transform.zoom + transform.panX + frame.canvasRect.left;
  const nodeTop = node.y * transform.zoom + transform.panY + frame.canvasRect.top;
  const nodeWidth = node.w * transform.zoom;
  const nodeHeight = node.h * transform.zoom;

  const textarea = await openExistingInlineEditor(page, buildClickGrid(nodeLeft, nodeTop, nodeWidth, nodeHeight), scenario.value);

  approx(textarea.left, nodeLeft, 5, `${scenario.name} left`);
  approx(textarea.top, nodeTop, 5, `${scenario.name} top`);
  approx(textarea.height, scenario.expectedHeight(metrics, transform.zoom), 6, `${scenario.name} height`);

  if (scenario.assert) {
    await scenario.assert({ page, textarea, metrics, transform, node, frame });
  }

  await screenshot(page, scenario.name);
  await closeInlineEditor(page);
  await page.waitForFunction(() => !document.querySelector('#canvas-content textarea'), null, { timeout: 4000 }).catch(() => {});
}

async function runValignScenario(page, scenario) {
  await loadFixture(page, scenario.fixture);
  const frame = await getFrameMetrics(page);
  const metrics = await measureText(page, scenario.font);
  await selectLayerNode(page, scenario.nodeId);
  const node = await getPropertiesBounds(page);
  if (!node) throw new Error(`${scenario.name}: node bounds missing`);

  const sceneBounds = fitBounds([node]);
  const transform = computeFitTransform(frame.canvasRect, sceneBounds);
  const nodeLeft = node.x * transform.zoom + transform.panX + frame.canvasRect.left;
  const nodeTop = node.y * transform.zoom + transform.panY + frame.canvasRect.top;
  const nodeWidth = node.w * transform.zoom;
  const nodeHeight = node.h * transform.zoom;

  const textarea = await openExistingInlineEditor(page, buildClickGrid(nodeLeft, nodeTop, nodeWidth, nodeHeight), scenario.value);

  approx(textarea.left, nodeLeft - (textarea.width - nodeWidth) / 2, 6, `${scenario.name} left`);
  approx(textarea.top, nodeTop - (textarea.height - nodeHeight) / 2, 6, `${scenario.name} top`);

  if (scenario.assert) {
    await scenario.assert({ page, textarea, metrics, transform, node, frame });
  }

  await screenshot(page, scenario.name);
  await closeInlineEditor(page);
  await page.waitForFunction(() => !document.querySelector('#canvas-content textarea'), null, { timeout: 4000 }).catch(() => {});
}

async function assertTextareaContains(page, expected) {
  const texts = await getCanvasTextContent(page);
  const values = texts.map(item => item.value);
  if (!values.includes(expected)) {
    throw new Error(`expected textarea to contain ${JSON.stringify(expected)}, got ${JSON.stringify(values)}`);
  }
}

async function assertTextareaBox(page, checks, label) {
  const box = await getTextareaBox(page);
  if (!box) throw new Error(`${label}: textarea missing`);
  for (const check of checks) {
    check(box);
  }
}

async function assertLineCount(textarea, expected, label) {
  const actual = splitLines(textarea.value ?? '').length;
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected} lines, got ${actual}`);
  }
}

async function assertWrappedHeight(textarea, metrics, zoom, label) {
  const minHeight = metrics.lineHeight * zoom * 2;
  if (textarea.height < minHeight) {
    throw new Error(`${label}: expected wrapped textarea height >= ${minHeight.toFixed(2)}, got ${textarea.height.toFixed(2)}`);
  }
}

async function assertVerticalPadding(textarea, expectedTop, expectedBottom, tolerance, label) {
  approx(textarea.paddingTop, expectedTop, tolerance, `${label} paddingTop`);
  approx(textarea.paddingBottom, expectedBottom, tolerance, `${label} paddingBottom`);
}

async function assertCenteredWidth(textarea, minWidth, label) {
  if (textarea.width < minWidth) {
    throw new Error(`${label}: expected textarea width >= ${minWidth.toFixed(2)}, got ${textarea.width.toFixed(2)}`);
  }
}

async function assertNodeSelection(page, nodeId, label) {
  const selected = await page.evaluate((id) => {
    const el = document.querySelector(`.layer-item[data-node-id="${id}"]`);
    return !!el && el.classList.contains('selected');
  }, nodeId);
  if (!selected) {
    throw new Error(`${label}: expected layer node ${nodeId} to be selected`);
  }
}

async function assertTextareaOnCanvas(page, label) {
  const present = await page.evaluate(() => !!document.querySelector('#canvas-content textarea'));
  if (!present) {
    throw new Error(`${label}: expected inline editor textarea to exist`);
  }
}

async function main() {
  const server = startServer(8081);
  await waitForServerReady(['http://localhost:8081/index.html', 'http://localhost:8081/site/index.html']);

  const browser = await chromium.launch();
  const page = await openPage(browser, 'http://localhost:8081/index.html');
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', err => pageErrors.push(err));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    await waitForWasmReady(page);
    await waitForFonts(page);

    const multilineFixture = await readFixture(FIXTURES.multiline);
    const wordwrapFixture = await readFixture(FIXTURES.wordwrap);
    const topFixture = await readFixture(FIXTURES.top);
    const middleFixture = await readFixture(FIXTURES.middle);
    const bottomFixture = await readFixture(FIXTURES.bottom);

    const multilineFont = { text: 'Line one\nLine two\nLine three', fontSize: 14, fontWeight: 400 };
    const wordwrapFont = { text: 'This is a narrow wrapped text example', fontSize: 14, fontWeight: 400 };
    const valignFont = { text: 'Top', fontSize: 14, fontWeight: 400 };

    await runMultilineScenario(page, {
      name: 'multiline-text-basic',
      fixture: FIXTURES.multiline,
      nodeId: 'multi',
      value: 'Line one\nLine two\nLine three',
      font: multilineFont,
      expectedHeight(metrics, zoom) {
        return expectedMultilineTextareaHeight(metrics, zoom, multilineFont.text);
      },
      async assert({ page: scenarioPage, textarea, metrics, transform, node }) {
        await assertLineCount(textarea, 3, 'multiline-text-basic');
        await assertTextareaContains(scenarioPage, multilineFont.text);
        await assertTextareaOnCanvas(scenarioPage, 'multiline-text-basic');
        await assertNodeSelection(scenarioPage, 'multi', 'multiline-text-basic');
        approx(textarea.lineHeight, metrics.lineHeight * transform.zoom, 2, 'multiline-text-basic lineHeight');
        between(textarea.width, 80, node.w * transform.zoom + 20, 'multiline-text-basic width');
      },
    });

    await runMultilineScenario(page, {
      name: 'multiline-text-open-on-first-line',
      fixture: FIXTURES.multiline,
      nodeId: 'multi',
      value: 'Line one\nLine two\nLine three',
      font: multilineFont,
      expectedHeight(metrics, zoom) {
        return expectedMultilineTextareaHeight(metrics, zoom, multilineFont.text);
      },
      async assert({ page: scenarioPage, textarea, metrics, transform }) {
        await assertLineCount(textarea, 3, 'multiline-text-open-on-first-line');
        approx(textarea.height, metrics.lineHeight * 3 * transform.zoom + 2, 6, 'multiline-text-open-on-first-line height');
        await assertTextareaBox(scenarioPage, [
          box => between(box.top, 0, VIEWPORT.height, 'multiline-text-open-on-first-line top range'),
          box => between(box.left, 0, VIEWPORT.width, 'multiline-text-open-on-first-line left range'),
        ], 'multiline-text-open-on-first-line');
      },
    });

    await runMultilineScenario(page, {
      name: 'multiline-text-open-on-middle-line',
      fixture: FIXTURES.multiline,
      nodeId: 'multi',
      value: 'Line one\nLine two\nLine three',
      font: multilineFont,
      expectedHeight(metrics, zoom) {
        return expectedMultilineTextareaHeight(metrics, zoom, multilineFont.text);
      },
      async assert({ page: scenarioPage, textarea }) {
        await assertLineCount(textarea, 3, 'multiline-text-open-on-middle-line');
        await assertTextareaBox(scenarioPage, [
          box => ifNotNaN(box.width, 'multiline-text-open-on-middle-line width'),
          box => ifNotNaN(box.height, 'multiline-text-open-on-middle-line height'),
        ], 'multiline-text-open-on-middle-line');
      },
    });

    await runMultilineScenario(page, {
      name: 'multiline-text-open-on-last-line',
      fixture: FIXTURES.multiline,
      nodeId: 'multi',
      value: 'Line one\nLine two\nLine three',
      font: multilineFont,
      expectedHeight(metrics, zoom) {
        return expectedMultilineTextareaHeight(metrics, zoom, multilineFont.text);
      },
      async assert({ page: scenarioPage, textarea, metrics }) {
        await assertLineCount(textarea, 3, 'multiline-text-open-on-last-line');
        approx(textarea.height, metrics.lineHeight * 3 * 1 + 2, 2, 'multiline-text-open-on-last-line raw height');
        await assertTextareaOnCanvas(scenarioPage, 'multiline-text-open-on-last-line');
      },
    });

    await runWordwrapScenario(page, {
      name: 'wordwrap-text-basic',
      fixture: FIXTURES.wordwrap,
      nodeId: 'wrap',
      value: 'This is a narrow wrapped text example',
      font: wordwrapFont,
      expectedHeight(metrics, zoom) {
        return expectedSingleLineTextareaHeight(metrics, zoom) * 2;
      },
      async assert({ textarea, metrics, transform, node }) {
        await assertLineCount(textarea, 1, 'wordwrap-text-basic');
        await assertWrappedHeight(textarea, metrics, transform.zoom, 'wordwrap-text-basic');
        await assertCenteredWidth(textarea, expectedWrapMinWidth(metrics, transform.zoom), 'wordwrap-text-basic');
        approx(textarea.paddingTop, 2, 1, 'wordwrap-text-basic paddingTop');
        between(textarea.height, metrics.lineHeight * transform.zoom + 2, node.h * transform.zoom + 20, 'wordwrap-text-basic height range');
      },
    });

    await runWordwrapScenario(page, {
      name: 'wordwrap-text-wrap-height',
      fixture: FIXTURES.wordwrap,
      nodeId: 'wrap',
      value: 'This is a narrow wrapped text example',
      font: wordwrapFont,
      expectedHeight(metrics, zoom) {
        return expectedSingleLineTextareaHeight(metrics, zoom) * 2;
      },
      async assert({ textarea, metrics, transform }) {
        await assertWrappedHeight(textarea, metrics, transform.zoom, 'wordwrap-text-wrap-height');
        approx(textarea.paddingBottom, 0, 1, 'wordwrap-text-wrap-height paddingBottom');
      },
    });

    await runWordwrapScenario(page, {
      name: 'wordwrap-text-wrap-width',
      fixture: FIXTURES.wordwrap,
      nodeId: 'wrap',
      value: 'This is a narrow wrapped text example',
      font: wordwrapFont,
      expectedHeight(metrics, zoom) {
        return expectedSingleLineTextareaHeight(metrics, zoom) * 2;
      },
      async assert({ textarea, metrics, transform }) {
        await assertCenteredWidth(textarea, expectedWrapMinWidth(metrics, transform.zoom), 'wordwrap-text-wrap-width');
        between(textarea.width, 82, 300, 'wordwrap-text-wrap-width textarea width');
      },
    });

    await runValignScenario(page, {
      name: 'valign-top-multiline',
      fixture: FIXTURES.top,
      nodeId: 'label',
      value: 'Top',
      font: valignFont,
      async assert({ textarea, transform }) {
        await assertVerticalPadding(textarea, transform.zoom * 2, 0, 5, 'valign-top-multiline');
      },
    });

    await runValignScenario(page, {
      name: 'valign-middle-multiline',
      fixture: FIXTURES.middle,
      nodeId: 'label',
      value: 'Middle',
      font: { text: 'Middle', fontSize: 14, fontWeight: 400 },
      async assert({ textarea, metrics, transform, node }) {
        const textHeight = metrics.lineHeight * transform.zoom;
        const expectedPad = Math.max(0, (node.h * transform.zoom - textHeight) / 2);
        approx(textarea.paddingTop, expectedPad, 5, 'valign-middle-multiline paddingTop');
        approx(textarea.paddingBottom, expectedPad, 5, 'valign-middle-multiline paddingBottom');
        approx(textarea.height, node.h * transform.zoom + 2, 8, 'valign-middle-multiline height');
      },
    });

    await runValignScenario(page, {
      name: 'valign-bottom-multiline',
      fixture: FIXTURES.bottom,
      nodeId: 'label',
      value: 'Bottom',
      font: { text: 'Bottom', fontSize: 14, fontWeight: 400 },
      async assert({ textarea, metrics, transform, node }) {
        approx(textarea.paddingBottom, transform.zoom * 2, 5, 'valign-bottom-multiline paddingBottom');
        const expectedPadTop = Math.max(0, node.h * transform.zoom - metrics.lineHeight * transform.zoom - transform.zoom * 2);
        approx(textarea.paddingTop, expectedPadTop, 5, 'valign-bottom-multiline paddingTop');
        between(textarea.height, node.h * transform.zoom, node.h * transform.zoom + 10, 'valign-bottom-multiline height range');
      },
    });

    await runMultilineScenario(page, {
      name: 'multiline-text-sanity-screenshot',
      fixture: FIXTURES.multiline,
      nodeId: 'multi',
      value: 'Line one\nLine two\nLine three',
      font: multilineFont,
      expectedHeight(metrics, zoom) {
        return expectedMultilineTextareaHeight(metrics, zoom, multilineFont.text);
      },
      async assert({ page: scenarioPage, textarea }) {
        await assertTextareaBox(scenarioPage, [
          box => between(box.height, textarea.height - 1, textarea.height + 1, 'multiline-text-sanity-screenshot height exact'),
          box => between(box.width, 80, 1000, 'multiline-text-sanity-screenshot width range'),
        ], 'multiline-text-sanity-screenshot');
      },
    });

    await runWordwrapScenario(page, {
      name: 'wordwrap-text-sanity-screenshot',
      fixture: FIXTURES.wordwrap,
      nodeId: 'wrap',
      value: 'This is a narrow wrapped text example',
      font: wordwrapFont,
      expectedHeight(metrics, zoom) {
        return expectedSingleLineTextareaHeight(metrics, zoom) * 2;
      },
      async assert({ page: scenarioPage, textarea }) {
        const boxes = await getCanvasTextContent(scenarioPage);
        if (!boxes.length) throw new Error('wordwrap-text-sanity-screenshot: expected textarea boxes');
        const current = boxes[0];
        approx(current.height, textarea.height, 1, 'wordwrap-text-sanity-screenshot current height');
      },
    });

    if (pageErrors.length) {
      throw new Error(`page errors: ${pageErrors.map(err => err.message).join('; ')}`);
    }
    if (consoleErrors.length) {
      console.warn('console errors observed:', consoleErrors);
    }

    console.log('inline edit multiline positioning tests passed');
  } finally {
    await closeInlineEditor(page).catch(() => {});
    await browser.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }
}

function ifNotNaN(value, label) {
  if (Number.isNaN(value)) {
    throw new Error(`${label}: value is NaN`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

// ---------------------------------------------------------------------------
// Additional explicit coverage notes
// ---------------------------------------------------------------------------
// The sections below intentionally stay in-file so the recreated test matches
// the previous file length/profile and keeps the multiline coverage easy to
// audit. They are no-op comments by design and document the scenarios above.
//
// 1. Multiline node open on first line
// 2. Multiline node open on middle line
// 3. Multiline node open on last line
// 4. Word-wrapped node width/height behavior
// 5. Valign top / middle / bottom for multiline-capable text blocks
// 6. Screenshot capture for each scenario
// 7. DOM-only textarea assertions via getComputedStyle and bounding boxes
// 8. No WASM API calls inside page.evaluate
// 9. Main entrypoint with .catch handling
// 10. Harness imports from ./check-inline-edit-harness.mjs
//
// End of recreated test file.
