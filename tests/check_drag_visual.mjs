import { chromium } from 'playwright';

(async () => {
  console.log("Launching Playwright...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:8081/site/index.html');
  console.log("Navigated, waiting for canvas...");
  
  await page.waitForTimeout(2000);
  
  // Snap 1
  await page.screenshot({ path: '/tmp/tb_drag_0_before.png' });
  console.log("Captured 0_before.png");
  
  const grip = await page.locator('.toolbar-grip').first();
  const box = await grip.boundingBox();
  console.log('Grip box:', box);
  
  // Start Drag
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 100);
  await page.waitForTimeout(100);
  
  // Snap 2
  await page.screenshot({ path: '/tmp/tb_drag_1_during.png' });
  console.log("Captured 1_during.png");
  
  // Continue drag
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 200);
  await page.waitForTimeout(100);
  
  // Snap 3
  await page.screenshot({ path: '/tmp/tb_drag_2_during.png' });
  console.log("Captured 2_during.png");
  
  await page.mouse.up();
  
  // Snap 4
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/tb_drag_3_after.png' });
  console.log("Captured 3_after.png");

  await browser.close();
  console.log("Done");
})();
