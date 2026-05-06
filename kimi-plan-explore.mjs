import { chromium } from 'playwright';
import { execSync } from 'child_process';

const evidencePath = execSync('evidence-path').toString().trim();
console.log('Evidence path:', evidencePath);

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Browser launched in headed mode');
  
  // Navigate to kimi.com
  await page.goto('https://kimi.com', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Navigated to kimi.com');
  
  // Take screenshot of homepage
  await page.screenshot({ path: `${evidencePath}/kimi-homepage.png`, fullPage: true });
  console.log('Homepage screenshot saved');
  
  // Try to click sidebar toggle
  try {
    const sidebarToggle = await page.$('button[aria-label*="menu"], button[aria-label*="sidebar"], [class*="sidebar"], [class*="menu"]');
    if (sidebarToggle) {
      console.log('Found sidebar toggle, clicking...');
      await sidebarToggle.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${evidencePath}/kimi-sidebar.png`, fullPage: true });
      console.log('Sidebar screenshot saved');
      
      // Look for account/login links in sidebar
      const sidebarLinks = await page.$$eval('a, button', elements => 
        elements.map(el => ({ text: el.innerText.trim(), tag: el.tagName }))
          .filter(el => el.text && (el.text.toLowerCase().includes('login') || 
                                    el.text.toLowerCase().includes('sign') || 
                                    el.text.toLowerCase().includes('account') ||
                                    el.text.toLowerCase().includes('profile') ||
                                    el.text.toLowerCase().includes('plan') ||
                                    el.text.toLowerCase().includes('billing') ||
                                    el.text.toLowerCase().includes('settings')))
      );
      console.log('Sidebar links found:', JSON.stringify(sidebarLinks, null, 2));
    }
  } catch (e) {
    console.log('Sidebar interaction failed:', e.message);
  }
  
  // Try clicking model selector to see plan info
  try {
    const modelSelector = await page.$('text=K2.6 Instant');
    if (modelSelector) {
      console.log('Found model selector, clicking...');
      await modelSelector.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${evidencePath}/kimi-model-selector.png`, fullPage: true });
      console.log('Model selector screenshot saved');
    }
  } catch (e) {
    console.log('Model selector interaction failed:', e.message);
  }
  
  // Try common account URLs
  const accountUrls = [
    'https://www.kimi.com/login',
    'https://www.kimi.com/account',
    'https://www.kimi.com/settings',
    'https://www.kimi.com/billing',
    'https://www.kimi.com/pricing',
    'https://www.kimi.com/plans'
  ];
  
  for (const url of accountUrls) {
    try {
      console.log(`Trying ${url}...`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      const title = await page.title();
      const currentUrl = page.url();
      console.log(`  Title: ${title}`);
      console.log(`  URL: ${currentUrl}`);
      
      const filename = url.split('/').pop() || 'unknown';
      await page.screenshot({ path: `${evidencePath}/kimi-${filename}.png`, fullPage: true });
      console.log(`  Screenshot saved: kimi-${filename}.png`);
      
      // Look for plan info on this page
      const pageText = await page.$eval('body', el => el.innerText);
      if (pageText.toLowerCase().includes('plan') || 
          pageText.toLowerCase().includes('subscription') ||
          pageText.toLowerCase().includes('billing') ||
          pageText.toLowerCase().includes('credits')) {
        console.log('  ✓ Found plan/billing related content on this page!');
      }
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
  }
  
  // Keep browser open so user can see
  console.log('Browser will stay open for 15 seconds...');
  await page.waitForTimeout(15000);
  
  await browser.close();
  console.log('Browser closed');
})();
