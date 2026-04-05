import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
    console.error('JS_ERROR:', err.message);
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('CONSOLE_ERROR:', msg.text());
    }
  });

  await page.goto('http://localhost:8081/site/index.html');
  
  // Wait for load
  await page.waitForTimeout(2000);
  
  try {
    const grip = await page.locator('.toolbar-grip').first();
    const box = await grip.boundingBox();
    console.log('Grip box:', box);
    
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    
    // Drag
    for(let i=0; i<3; i++) {
        await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 100);
        await page.waitForTimeout(50);
        
        const cssLog = await page.evaluate(() => {
           const t = document.getElementById('floating-toolbar');
           return {
             left: t.style.left,
             top: t.style.top,
             transform: t.style.transform,
             classList: Array.from(t.classList)
           };
        });
        console.log('DRAG STEP ' + i + ' LOG:', cssLog);
    }
    
    await page.mouse.up();
    console.log('Drag done.');
    
    // Wait for animation
    await page.waitForTimeout(500);
    
    const finalLog = await page.evaluate(() => {
       const t = document.getElementById('floating-toolbar');
       return {
         left: t.style.left,
         top: t.style.top,
         transform: t.style.transform,
         classList: Array.from(t.classList)
       };
    });
    console.log('FINAL SNAP LOG:', finalLog);
  } catch (err) {
    console.error('PLAYWRIGHT_ERROR:', err);
  }
  
  await browser.close();
})();
