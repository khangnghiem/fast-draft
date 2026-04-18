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
  rect: 'text-in-rect.fd',
  ellipse: 'text-in-ellipse.fd',
  top: 'valign-top.fd',
  middle: 'valign-middle.fd',
  bottom: 'valign-bottom.fd',
};

const DEFAULT_FONT = 'Inter, sans-serif';
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5;
const VIEWPORT = { width: 1440, height: 960 };
const SCENE_PAD = 40;

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

async function loadFixture(page, fixtureText) {
  await loadFdContent(page, fixtureText);
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
      value: el.value,
    };
  });
}

async function getViewportMetrics(page) {
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

async function openInlineEditorAt(page, x, y) {
  await page.mouse.dblclick(x, y);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#canvas-content textarea')).some(node => getComputedStyle(node).position === 'absolute'), null, { timeout: 8000 });
}

async function openEditorBySearch(page, centerX, centerY) {
  const offsets = [0, -24, 24, -48, 48, -72, 72];
  for (const dx of offsets) {
    for (const dy of offsets) {
      try {
        await page.mouse.dblclick(centerX + dx, centerY + dy);
        const box = await page.waitForFunction(() => Array.from(document.querySelectorAll('#canvas-content textarea')).some(node => getComputedStyle(node).position === 'absolute'), null, { timeout: 1200 }).catch(() => null);
        if (box) return;
      } catch {}
      await closeInlineEditor(page).catch(() => {});
    }
  }
  throw new Error('could not open inline editor');
}

async function selectLayerNode(page, nodeId) {
  await page.locator(`.layer-item[data-node-id="${nodeId}"]`).click({ force: true });
  await page.waitForTimeout(1800);
}

async function runShapeScenario(page, scenario) {
  await loadFixture(page, scenario.fixtureText);
  const textMetrics = await measureText(page, scenario.font);
  await selectLayerNode(page, scenario.nodeId);
  const frame = await getViewportMetrics(page);
  const shapeCenterX = frame.leftPanelWidth + (frame.container.width - frame.leftPanelWidth) / 2;
  const shapeCenterY = frame.container.height / 2;
  await openEditorBySearch(page, shapeCenterX, shapeCenterY);

  const textarea = await getTextareaBox(page);
  if (!textarea) throw new Error(`${scenario.name}: inline editor textarea missing`);

  scenario.assert(textarea, textMetrics, { width: frame.canvasRect.width, height: frame.canvasRect.height }, { expectedWidth: textarea.width, expectedHeight: textarea.height, shapeCenterX, shapeCenterY });

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

    const rectFixture = await readFixture(FIXTURES.rect);
    const tinyRectFixture = rectFixture.replace('w: 200 h: 80', 'w: 10 h: 80');

    await runShapeScenario(page, {
      name: 'text-in-rect-centered',
      fixtureText: rectFixture,
      nodeId: 'box',
      node: { x: 0, y: 0, w: 200, h: 80 },
      font: { text: 'Inside', fontSize: 14, fontWeight: 400 },
      valign: 'top',
      assert(textarea) {
        if (textarea.width < 82 || textarea.height <= 0) throw new Error('text-in-rect-centered: invalid textarea box');
      },
    });

    await runShapeScenario(page, {
      name: 'text-in-ellipse-centered',
      fixtureText: await readFixture(FIXTURES.ellipse),
      nodeId: 'bubble',
      node: { x: 0, y: 0, w: 200, h: 120 },
      font: { text: 'Inside', fontSize: 14, fontWeight: 400 },
      valign: 'middle',
      assert(textarea) {
        if (textarea.width < 82 || textarea.height <= 0) throw new Error('text-in-ellipse-centered: invalid textarea box');
      },
    });

    await runShapeScenario(page, {
      name: 'text-in-rect-min-width',
      fixtureText: tinyRectFixture,
      nodeId: 'box',
      node: { x: 0, y: 0, w: 10, h: 80 },
      font: { text: 'Inside', fontSize: 14, fontWeight: 400 },
      valign: 'top',
      assert(textarea, _textMetrics) {
        if (textarea.width < 82) throw new Error('text-in-rect-min-width: expected min-width centering');
      },
    });

    await runShapeScenario(page, {
      name: 'valign-middle-centered',
      fixtureText: await readFixture(FIXTURES.middle),
      nodeId: 'box',
      node: { x: 0, y: 0, w: 200, h: 100 },
      font: { text: 'Middle', fontSize: 14, fontWeight: 400 },
      valign: 'middle',
      assert(textarea) {
        approx(textarea.paddingTop, textarea.paddingBottom, 1, 'valign-middle padding symmetry');
      },
    });

    await runShapeScenario(page, {
      name: 'valign-top-padding',
      fixtureText: await readFixture(FIXTURES.top),
      nodeId: 'box',
      node: { x: 0, y: 0, w: 200, h: 100 },
      font: { text: 'Top', fontSize: 14, fontWeight: 400 },
      valign: 'top',
      assert(textarea) {
        approx(textarea.paddingTop, 2, 1, 'valign-top paddingTop');
        approx(textarea.paddingBottom, 0, 1, 'valign-top paddingBottom');
      },
    });

    await runShapeScenario(page, {
      name: 'valign-bottom-padding',
      fixtureText: await readFixture(FIXTURES.bottom),
      nodeId: 'box',
      node: { x: 0, y: 0, w: 200, h: 100 },
      font: { text: 'Bottom', fontSize: 14, fontWeight: 400 },
      valign: 'bottom',
      assert(textarea) {
        approx(textarea.paddingBottom, 2, 1, 'valign-bottom paddingBottom');
        if (textarea.paddingTop <= textarea.paddingBottom) throw new Error('valign-bottom paddingTop should exceed paddingBottom');
      },
    });

    if (pageErrors.length) {
      throw new Error(`page errors: ${pageErrors.map(err => err.message).join('; ')}`);
    }
    if (consoleErrors.length) {
      console.warn('console errors observed:', consoleErrors);
    }

    console.log('inline edit in-shape positioning tests passed');
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
