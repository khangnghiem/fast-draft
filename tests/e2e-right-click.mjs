import { chromium } from 'playwright';
import path from 'path';

import http from 'http';
import fs from 'fs';

(async () => {
  let browser = null;
  let server = null;

  // Ensure cleanup on abrupt termination signals
  const cleanup = async () => {
    console.log("\nReceived kill signal, cleaning up Playwright and Server...");
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
    process.exit(1);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    console.log("Starting embedded Node.js web server...");
    server = http.createServer((req, res) => {
      let filePath = path.join(path.resolve('site'), req.url === '/' ? 'index.html' : req.url.split('?')[0]);
      if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(filePath);
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' }[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(fs.readFileSync(filePath));
    }).listen(8092);
    
    await new Promise(r => setTimeout(r, 500)); // wait for socket bind

    console.log("Launching Playwright to test Canvas Context Menu...");
    browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Forward page console logs and errors to terminal
    page.on('console', msg => console.log(`PAGE LOG: ${msg.text()}`));
    page.on('pageerror', exception => console.log(`PAGE ERROR: ${exception}`));
    
    const siteUrl = `http://localhost:8092/index.html`;
    console.log(`Navigating to ${siteUrl}`);
    
    await page.goto(siteUrl);
    
    // Wait for canvas to be present
    await page.waitForSelector('#fd-canvas', { state: 'attached' });
    
    // Wait for WASM engine to initialize (loading overlay hides)
    console.log("Waiting for WASM engine to initialize...");
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return !loading || getComputedStyle(loading).display === 'none';
    }, { timeout: 15000 });
    await page.waitForTimeout(500); // give it a beat
    
    // Add debug logging to capture the raw pointer events
    await page.evaluate(() => {
      document.getElementById('fd-canvas').addEventListener('pointerdown', e => {
        console.log(`POINTERDOWN: button=${e.button}, pointerId=${e.pointerId}`);
      });
      document.addEventListener('pointerup', e => {
        console.log(`POINTERUP: button=${e.button}, pointerId=${e.pointerId}`);
      });
    });

    console.log("Simulating right-click pointer events on center of canvas...");
    const canvasLocator = page.locator('#fd-canvas');
    const box = await canvasLocator.boundingBox();
    const clickX = box.x + box.width / 2;
    const clickY = box.y + box.height / 2;
    
    await page.mouse.move(clickX, clickY);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(50); // Small duration to ensure it is registered as short click
    await page.mouse.up({ button: 'right' });
    
    // Look for the context menu
    console.log("Waiting for context menu UI (.ctx-menu)...");
    await page.waitForSelector('.ctx-menu', { state: 'visible', timeout: 5000 });
    console.log("✅ Success! Right-click context menu appeared without crashing.");

  } catch (err) {
    console.error("❌ Fatal error or timeout during test execution:", err.message);
    process.exitCode = 1;
  } finally {
    console.log("Shutting down resources...");
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }
})();
