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

const FIXTURE = 'positioned-text.fd';
const BASE_POINT = { x: 300, y: 80 };
const ZOOM_ANCHOR = { x: 100, y: 100 };
const WHEEL_FACTOR = 1.04;
const WHEEL_STEPS = 18;

function approx(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected.toFixed(2)} ±${tolerance}, got ${actual.toFixed(2)}`);
  }
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

async function loadFixture(page) {
  await loadFdContent(page, await readFixture(FIXTURE));
  await page.locator('.lp-tab[data-tab="layers"]').click().catch(() => {});
  await page.waitForTimeout(200);
  await page.waitForTimeout(900);
}

async function getCanvasBox(page) {
  return await page.locator('#fd-canvas').boundingBox();
}

async function getTextareaBox(page) {
  return await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('#canvas-content textarea')).find(node => getComputedStyle(node).position === 'absolute');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });
}

async function waitForTextarea(page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#canvas-content textarea')).some(node => getComputedStyle(node).position === 'absolute'), null, { timeout: 8000 });
}

async function zoomWithWheel(page, canvasBox, direction, steps) {
  const deltaY = direction === 'in' ? -120 : 120;
  for (let i = 0; i < steps; i++) {
    await page.evaluate(({ clientX, clientY, deltaY }) => {
      const canvas = document.querySelector('#fd-canvas');
      canvas?.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaMode: 0,
        deltaY,
        clientX,
        clientY,
      }));
    }, { clientX: canvasBox.x + ZOOM_ANCHOR.x, clientY: canvasBox.y + ZOOM_ANCHOR.y, deltaY });
  }
  await page.waitForTimeout(150);
}

async function panWithMiddleDrag(page, canvasBox, dx, dy) {
  const startX = canvasBox.x + 720;
  const startY = canvasBox.y + 480;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(startX + dx, startY + dy, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(150);
}

function transformedPoint({ x, y }, zoom, panX, panY) {
  return {
    x: ZOOM_ANCHOR.x + (x - ZOOM_ANCHOR.x) * zoom + panX,
    y: ZOOM_ANCHOR.y + (y - ZOOM_ANCHOR.y) * zoom + panY,
  };
}

async function openInlineEditorAt(page, canvasBox, point) {
  await page.mouse.dblclick(canvasBox.x + point.x, canvasBox.y + point.y);
  await waitForTextarea(page);
}

async function runScenario(browser, scenario) {
  const page = await openPage(browser, 'http://localhost:8081/index.html');
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', err => {
    if (!/editorFocused is not defined/.test(err.message)) pageErrors.push(err);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    await waitForWasmReady(page);
    await loadFixture(page);

    const canvasBox = await getCanvasBox(page);
    if (!canvasBox) throw new Error(`${scenario.name}: canvas not found`);

    const zoom = scenario.zoom ? Math.pow(WHEEL_FACTOR, WHEEL_STEPS * (scenario.zoom === 'in' ? 1 : -1)) : 1;
    const panX = scenario.pan?.x || 0;
    const panY = scenario.pan?.y || 0;
    const expected = transformedPoint(BASE_POINT, zoom, panX, panY);

    if (scenario.zoom) {
      await zoomWithWheel(page, canvasBox, scenario.zoom, WHEEL_STEPS);
    }
    if (scenario.pan) {
      await panWithMiddleDrag(page, canvasBox, panX, panY);
    }

    await openInlineEditorAt(page, canvasBox, expected);
    const textarea = await getTextareaBox(page);
    if (!textarea) throw new Error(`${scenario.name}: inline editor textarea missing`);

    approx(textarea.left, canvasBox.x + expected.x, 6, `${scenario.name} left`);
    approx(textarea.top, canvasBox.y + expected.y, 6, `${scenario.name} top`);

    await screenshot(page, scenario.name);
    await closeInlineEditor(page);
    await page.waitForFunction(() => !document.querySelector('#canvas-content textarea'), null, { timeout: 4000 }).catch(() => {});

    if (pageErrors.length) {
      throw new Error(`${scenario.name}: page errors: ${pageErrors.map(err => err.message).join('; ')}`);
    }
    if (consoleErrors.length) {
      console.warn(`${scenario.name}: console errors observed`, consoleErrors);
    }
  } finally {
    await closeInlineEditor(page).catch(() => {});
    await page.close().catch(() => {});
  }
}

async function main() {
  const server = startServer(8081);
  await waitForServerReady(['http://localhost:8081/index.html', 'http://localhost:8081/site/index.html']);

  const browser = await chromium.launch();
  const scenarios = [
    { name: 'inline-edit-zoom-pan-baseline' },
    { name: 'inline-edit-zoom-pan-zoom-in', zoom: 'in' },
    { name: 'inline-edit-zoom-pan-zoom-out', zoom: 'out' },
    { name: 'inline-edit-zoom-pan-pan-right', pan: { x: 120, y: 0 } },
    { name: 'inline-edit-zoom-pan-pan-down', pan: { x: 0, y: 90 } },
    { name: 'inline-edit-zoom-pan-zoom-in-pan', zoom: 'in', pan: { x: 100, y: 60 } },
  ];

  try {
    for (const scenario of scenarios) {
      await runScenario(browser, scenario);
    }
    console.log('inline edit zoom/pan tests passed');
  } finally {
    await browser.close().catch(() => {});
    await stopServer(server).catch(() => {});
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
