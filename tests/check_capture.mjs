import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.setContent(`
    <style>
      #grip { width: 100px; height: 100px; background: red; touch-action: none; }
      #child { width: 50px; height: 50px; background: blue; pointer-events: auto; }
    </style>
    <div id="grip">
      <div id="child"></div>
    </div>
  `);
  
  await page.evaluate(() => {
    const grip = document.getElementById('grip');
    grip.addEventListener('pointerdown', (e) => {
      console.log('e.target:', e.target.id);
      try {
        grip.setPointerCapture(e.pointerId);
        console.log('capture success');
      } catch (err) {
        console.log('capture FAIL:', err.message);
      }
    });
  });

  page.on('console', msg => console.log(msg.text()));
  
  const box = await page.locator('#child').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  
  await browser.close();
})();
