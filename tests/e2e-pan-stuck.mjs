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

    console.log("Launching Playwright to test Pan Stuck Bug...");
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
    
    console.log("Waiting for WASM engine to initialize...");
    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      return !loading || getComputedStyle(loading).display === 'none';
    }, { timeout: 15000 });
    await page.waitForTimeout(500); 

    console.log("Simulating right-click pan out-of-bounds drop...");
    const canvasLocator = page.locator('#fd-canvas');
    const box = await canvasLocator.boundingBox();
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    
    // Move to canvas center and right-click DOWN
    await page.mouse.move(startX, startY);
    await page.mouse.down({ button: 'right' });
    
    // Drag WAY outside the canvas bounds (simulating leaving the window/iframe)
    await page.mouse.move(box.x - 500, box.y - 500, { steps: 5 });
    
    // Release outside (Playwright simulates the system dropping the event if targeted on a different frame, but we dispatch mouse up)
    // We send explicit mouseup outside
    await page.mouse.up({ button: 'right' });
    
    // Move back into canvas
    await page.mouse.move(startX, startY, { steps: 5 });
    await page.waitForTimeout(100);
    
    // Check if the cursor is stuck in 'grabbing' or if JS panState is active
    const isStuck = await page.evaluate(() => {
        // Since panDragging is scoped inside the block, we check the style
        const cursor = document.getElementById('fd-canvas').style.cursor;
        return cursor === 'grabbing' || cursor === 'zoom-in';
    });

    if (isStuck) {
      throw new Error("Canvas is still in grabbing/panning state after releasing right-click outside!");
    }
    
    console.log("✅ Success! Canvas did not get stuck in grabbing state.");

  } catch (err) {
    console.error("❌ Fatal error or timeout during test execution:", err.message);
    process.exitCode = 1;
  } finally {
    console.log("Shutting down resources...");
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }
})();
