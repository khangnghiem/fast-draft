import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log(`PAGE LOG: ${msg.text()}`));
  page.on('pageerror', exception => console.log(`PAGE ERROR: ${exception}`));

  await page.goto('http://localhost:8081/site/index.html');
  await page.waitForTimeout(2000);
  
  const grip = await page.locator('.toolbar-grip').first();
  const box = await grip.boundingBox();
  
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  
  await page.mouse.move(startX + 100, startY + 100, { steps: 5 });
  await page.waitForTimeout(100);
  
  await browser.close();
})();
