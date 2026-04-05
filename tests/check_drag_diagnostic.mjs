import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:8081/site/index.html');
  await page.waitForTimeout(2000);
  
  const grip = await page.locator('.toolbar-grip').first();
  const box = await grip.boundingBox();
  
  await page.evaluate(() => {
    window._dragLogs = [];
    document.addEventListener('pointerdown', e => window._dragLogs.push('global down ' + e.target.className));
    const g = document.querySelector('.toolbar-grip');
    g.addEventListener('pointerdown', e => window._dragLogs.push('grip down'));
    document.addEventListener('pointermove', e => window._dragLogs.push('global move ' + e.clientX + ',' + e.clientY));
  });

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  // Move sequentially
  await page.mouse.move(startX, startY, { steps: 5 });
  await page.mouse.down();
  
  await page.mouse.move(startX + 100, startY + 100, { steps: 10 });
  await page.waitForTimeout(100);
  
  const tbState1 = await page.evaluate(() => {
    const t = document.getElementById('floating-toolbar');
    const comp = window.getComputedStyle(t);
    return {
      styleLeft: t.style.left,
      styleTop: t.style.top,
      styleBottom: t.style.bottom,
      styleTransform: t.style.transform,
      compLeft: comp.left,
      compBottom: comp.bottom,
      compTransform: comp.transform,
      className: t.className,
      rect: t.getBoundingClientRect().toJSON(),
      logs: window._dragLogs.slice(0, 5) // truncate
    };
  });
  console.log('tbState1:', tbState1);

  await browser.close();
})();
