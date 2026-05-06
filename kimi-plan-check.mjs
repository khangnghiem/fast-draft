import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get evidence path
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
  const homeScreenshot = `${evidencePath}/kimi-homepage.png`;
  await page.screenshot({ path: homeScreenshot, fullPage: true });
  console.log('Screenshot saved:', homeScreenshot);
  
  // Get page title and URL
  const title = await page.title();
  const url = page.url();
  console.log('Page title:', title);
  console.log('Page URL:', url);
  
  // Look for login/account links
  const links = await page.$$eval('a', anchors => 
    anchors.map(a => ({ text: a.innerText.trim(), href: a.href }))
      .filter(a => a.text && (a.text.toLowerCase().includes('login') || 
                              a.text.toLowerCase().includes('sign in') || 
                              a.text.toLowerCase().includes('account') ||
                              a.text.toLowerCase().includes('profile') ||
                              a.text.toLowerCase().includes('plan') ||
                              a.text.toLowerCase().includes('billing')))
  );
  console.log('Found relevant links:', JSON.stringify(links, null, 2));
  
  // Try to find and click login/account button
  const loginSelectors = [
    'a:has-text("Log in")',
    'a:has-text("Sign in")',
    'a:has-text("Login")',
    'button:has-text("Log in")',
    'button:has-text("Sign in")',
    '[data-testid*="login"]',
    '[data-testid*="account"]'
  ];
  
  let loginFound = false;
  for (const selector of loginSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        console.log('Found login element with selector:', selector);
        await element.click();
        await page.waitForTimeout(2000);
        
        const loginScreenshot = `${evidencePath}/kimi-login.png`;
        await page.screenshot({ path: loginScreenshot, fullPage: true });
        console.log('Login page screenshot saved:', loginScreenshot);
        
        loginFound = true;
        break;
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  if (!loginFound) {
    console.log('No login link found on homepage');
  }
  
  // Keep browser open for a few seconds so user can see
  console.log('Browser will stay open for 10 seconds...');
  await page.waitForTimeout(10000);
  
  await browser.close();
  console.log('Browser closed');
})();
