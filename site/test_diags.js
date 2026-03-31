const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  
  await page.goto('http://localhost:8089/');
  // Wait for load
  await page.waitForTimeout(1000);
  
  // Set invalid code directly
  await page.evaluate(() => {
    window.api.getFdCanvas().set_text('123123 {');
    const diags = window.api.getFdCanvas().get_diagnostics();
    console.log('DIAGS:', diags);
  });
  
  await browser.close();
})();
