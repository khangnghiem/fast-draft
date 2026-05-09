import { chromium } from 'playwright';
import { execSync } from 'child_process';

const evidencePath = execSync('evidence-path').toString().trim();

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Browser launched in headed mode');
  
  // Navigate to kimi.com pricing/features page
  await page.goto('https://www.kimi.com/features', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('Navigated to features page');
  const featuresTitle = await page.title();
  console.log('Features page title:', featuresTitle);
  await page.screenshot({ path: `${evidencePath}/kimi-features.png`, fullPage: true });
  console.log('Features screenshot saved');
  
  // Look for plan info on features page
  const featuresText = await page.$eval('body', el => el.innerText);
  console.log('Features page has plan info:', 
    featuresText.toLowerCase().includes('plan') || 
    featuresText.toLowerCase().includes('pricing') ||
    featuresText.toLowerCase().includes('subscription'));
  
  // Navigate to main page and look for "Log In" button
  await page.goto('https://kimi.com', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Scroll to find login button (it might be in the sidebar or off-screen)
  // Try pressing Escape to close any overlays, then look for login
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  // Get all text on page to find login-related elements
  const allText = await page.$$eval('*', elements => 
    elements.map(el => el.innerText?.trim()).filter(Boolean)
  );
  const loginTexts = allText.filter(text => 
    text.toLowerCase().includes('log in') || 
    text.toLowerCase().includes('login') ||
    text.toLowerCase().includes('sign in') ||
    text.toLowerCase().includes('account')
  );
  console.log('Login-related text found:', loginTexts.slice(0, 10));
  
  // Try to find and screenshot the user nav area
  const userNav = await page.$('.user-nav');
  if (userNav) {
    console.log('Found user-nav element');
    await userNav.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await userNav.screenshot({ path: `${evidencePath}/kimi-user-nav.png` });
    console.log('User nav screenshot saved');
  }
  
  // Try clicking on the "Log In" span
  const loginSpan = await page.$('text=Log In');
  if (loginSpan) {
    console.log('Found "Log In" text, clicking...');
    await loginSpan.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${evidencePath}/kimi-after-login-click.png`, fullPage: true });
    console.log('Post-login-click screenshot saved');
    
    const currentUrl = page.url();
    console.log('URL after login click:', currentUrl);
  }
  
  // Check if we ended up on platform.kimi.com
  if (page.url().includes('platform.kimi.com')) {
    console.log('Redirected to platform.kimi.com');
    
    // Try to access user center or console
    const userCenterLink = await page.$('text=用户中心');
    if (userCenterLink) {
      console.log('Found User Center link');
    }
  }
  
  // Take final screenshot
  await page.screenshot({ path: `${evidencePath}/kimi-final-state.png`, fullPage: true });
  console.log('Final state screenshot saved');
  
  console.log('\nBrowser will stay open for 10 seconds...');
  await page.waitForTimeout(10000);
  
  await browser.close();
  console.log('Browser closed');
})();
