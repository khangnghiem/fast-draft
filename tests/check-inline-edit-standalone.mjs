import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import {
  closeInlineEditor,
  getTextareaPosition,
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
  standalone: 'standalone-text.fd',
  positioned: 'positioned-text.fd',
  styled: 'styled-text.fd',
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
    };
  }, { text, fontSize, fontWeight, fontFamily });
}

async function getFrameMetrics(page) {
  return await page.evaluate(() => {
    const canvas = document.getElementById('fd-canvas');
    const container = document.getElementById('canvas-content');
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
      canvasRect: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
      containerRect: { left: containerRect.left, top: containerRect.top },
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
      lineHeight: parseFloat(style.lineHeight),
      fontSize: parseFloat(style.fontSize),
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

async function runTextScenario(page, scenario) {
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

  const textarea = await openExistingInlineEditor(page, buildClickGrid(nodeLeft, nodeTop, node.w * transform.zoom, node.h * transform.zoom), scenario.value);

  approx(textarea.left, nodeLeft, 5, `${scenario.name} left`);
  approx(textarea.top, nodeTop, 5, `${scenario.name} top`);
  if (scenario.expectHeight != null) {
    approx(textarea.height, scenario.expectHeight(metrics, transform.zoom), 5, `${scenario.name} height`);
  }

  await screenshot(page, scenario.name);
  await closeInlineEditor(page);
  await page.waitForFunction(() => !document.querySelector('#canvas-content textarea'), null, { timeout: 4000 }).catch(() => {});
}

async function runShapeScenario(page, scenario) {
  await loadFixture(page, scenario.fixture);
  const frame = await getFrameMetrics(page);
  const textMetrics = await measureText(page, scenario.font);
  await selectLayerNode(page, scenario.nodeId);
  const node = await getPropertiesBounds(page);
  if (!node) throw new Error(`${scenario.name}: shape bounds missing`);
  const sceneBounds = fitBounds([node]);
  const transform = computeFitTransform(frame.canvasRect, sceneBounds);

  const shapeLeft = node.x * transform.zoom + transform.panX + frame.canvasRect.left;
  const shapeTop = node.y * transform.zoom + transform.panY + frame.canvasRect.top;

  const textarea = await openExistingInlineEditor(page, buildClickGrid(shapeLeft, shapeTop, node.w * transform.zoom, node.h * transform.zoom), scenario.value);

  const scaledW = node.w * transform.zoom;
  const scaledH = node.h * transform.zoom;
  const sw = Math.max(scaledW, 80) + 2;
  const sh = Math.max(scaledH, textMetrics.lineHeight * transform.zoom + 4);
  const expectedLeft = shapeLeft - (sw - scaledW) / 2;
  const expectedTop = shapeTop - (sh - scaledH) / 2;

  approx(textarea.left, expectedLeft, 5, `${scenario.name} left`);
  approx(textarea.top, expectedTop, 5, `${scenario.name} top`);
  scenario.assert(textarea, textMetrics, transform.zoom);

  await screenshot(page, scenario.name);
  await closeInlineEditor(page);
  await page.waitForFunction(() => !document.querySelector('#canvas-content textarea'), null, { timeout: 4000 }).catch(() => {});
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

    const standaloneFont = { text: 'Hello', fontSize: 14, fontWeight: 400 };
    const styledFont = { text: 'Styled', fontSize: 24, fontWeight: 700 };
    const shapeFont = { text: 'Top', fontSize: 14, fontWeight: 400 };

    await runTextScenario(page, {
      name: 'standalone-text-position',
      fixture: FIXTURES.standalone,
      nodeId: 't1',
      value: 'Hello',
      font: standaloneFont,
      expectHeight: metrics => metrics.height,
    });

    await runTextScenario(page, {
      name: 'positioned-text-offset',
      fixture: FIXTURES.positioned,
      nodeId: 't2',
      value: 'World',
      font: standaloneFont,
      expectHeight: metrics => metrics.height,
    });

    await runTextScenario(page, {
      name: 'styled-text-height',
      fixture: FIXTURES.styled,
      nodeId: 't3',
      value: 'Styled',
      font: styledFont,
      expectHeight: metrics => metrics.height,
    });

    await runShapeScenario(page, {
      name: 'valign-top-padding',
      fixture: FIXTURES.top,
      nodeId: 'label',
      value: 'Top',
      font: shapeFont,
      shape: { w: 200, h: 100 },
      assert(textarea, _textMetrics, zoom) {
        approx(textarea.paddingTop, zoom * 2, 5, 'valign-top paddingTop');
        approx(textarea.paddingBottom, 0, 1, 'valign-top paddingBottom');
      },
    });

    await runShapeScenario(page, {
      name: 'valign-middle-centering',
      fixture: FIXTURES.middle,
      nodeId: 'label',
      value: 'Middle',
      font: { text: 'Middle', fontSize: 14, fontWeight: 400 },
      shape: { w: 200, h: 100 },
      assert(textarea, textMetrics, zoom) {
        const textHeight = textMetrics.lineHeight * zoom;
        const expectedPad = Math.max(0, (100 * zoom - textHeight) / 2);
        approx(textarea.paddingTop, expectedPad, 5, 'valign-middle paddingTop');
        approx(textarea.paddingBottom, expectedPad, 5, 'valign-middle paddingBottom');
      },
    });

    await runShapeScenario(page, {
      name: 'valign-bottom-padding',
      fixture: FIXTURES.bottom,
      nodeId: 'label',
      value: 'Bottom',
      font: { text: 'Bottom', fontSize: 14, fontWeight: 400 },
      shape: { w: 200, h: 100 },
      assert(textarea, textMetrics, zoom) {
        approx(textarea.paddingBottom, zoom * 2, 5, 'valign-bottom paddingBottom');
        const expectedPadTop = Math.max(0, 100 * zoom - textMetrics.lineHeight * zoom - zoom * 2);
        approx(textarea.paddingTop, expectedPadTop, 5, 'valign-bottom paddingTop');
      },
    });

    if (pageErrors.length) {
      throw new Error(`page errors: ${pageErrors.map(err => err.message).join('; ')}`);
    }
    if (consoleErrors.length) {
      console.warn('console errors observed:', consoleErrors);
    }

    console.log('inline edit standalone positioning tests passed');
  } finally {
    await closeInlineEditor(page).catch(() => {});
    await browser.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
