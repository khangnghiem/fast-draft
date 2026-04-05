import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 700, height: 700 } });
  const page = await context.newPage();
  
  await page.goto('http://localhost:8081/site/index.html');
  await page.waitForLoadState('networkidle');
  
  // Inject console logs into the page's event listeners
  await page.evaluate(() => {
    window.diagnosticLogs = [];
    
    // Intercept AddEventListener on Document to catch the real functions
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type === 'pointermove' && this === document) {
        const wrapMove = function(e) {
          window.diagnosticLogs.push(`MOVE: clientX=${e.clientX}, isDragging=${typeof isDragging !== 'undefined' ? isDragging : '?'}`);
          listener.apply(this, arguments);
        };
        return originalAddEventListener.call(this, type, wrapMove, options);
      }
      if (type === 'pointerdown' && this.classList && this.classList.contains('toolbar-grip')) {
        const wrapDown = function(e) {
          window.diagnosticLogs.push(`DOWN: clientX=${e.clientX}, target=${e.target.className}`);
          listener.apply(this, arguments);
        };
        return originalAddEventListener.call(this, type, wrapDown, options);
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
  });
  
  // Reload page so our interceptor catches initToolbar
  await page.reload({ waitUntil: 'networkidle' });
  
  // Wait for toolbar
  await page.waitForSelector('.toolbar-grip');
  
  const grip = page.locator('.toolbar-grip').first();
  const box = await grip.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 50, startY + 50, { steps: 5 });
  // NO MOUSE UP, we want to see the state DURING the drag.
  
  const tbBox = await page.locator('#floating-toolbar').boundingBox();
  const logs = await page.evaluate(() => window.diagnosticLogs);
  
  console.log("FINAL TOOLBAR RECT:", tbBox);
  console.log("LOGS:", logs);
  
  await browser.close();
})();
