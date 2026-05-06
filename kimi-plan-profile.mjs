import { chromium } from 'playwright';
import { execSync } from 'child_process';

const evidencePath = execSync('evidence-path').toString().trim();

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Browser launched in headed mode');
  
  // First, navigate to kimi.com and try to access profile
  await page.goto('https://kimi.com', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Navigated to kimi.com');
  await page.waitForTimeout(2000);
  
  // Take screenshot showing logged-in state
  await page.screenshot({ path: `${evidencePath}/kimi-logged-in.png`, fullPage: true });
  console.log('Logged-in state screenshot saved');
  
  // Try to click on user avatar to open profile menu
  try {
    const userAvatar = await page.$('.user-avatar-container, .user-avatar, .user-info');
    if (userAvatar) {
      console.log('Found user avatar, clicking...');
      await userAvatar.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${evidencePath}/kimi-profile-menu.png`, fullPage: true });
      console.log('Profile menu screenshot saved');
      
      // Look for plan/account links in the dropdown
      const menuItems = await page.$$eval('a, button', elements =>
        elements.map(el => ({ text: el.innerText.trim(), href: el.href || '' }))
          .filter(el => el.text && (el.text.toLowerCase().includes('plan') || 
                                    el.text.toLowerCase().includes('billing') ||
                                    el.text.toLowerCase().includes('subscription') ||
                                    el.text.toLowerCase().includes('account') ||
                                    el.text.toLowerCase().includes('settings') ||
                                    el.text.toLowerCase().includes('profile')))
      );
      console.log('Menu items:', JSON.stringify(menuItems, null, 2));
    }
  } catch (e) {
    console.log('Profile menu interaction failed:', e.message);
  }
  
  // Now try platform.kimi.com
  console.log('\nTrying platform.kimi.com...');
  try {
    await page.goto('https://platform.kimi.com', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const title = await page.title();
    const url = page.url();
    console.log(`platform.kimi.com:`);
    console.log(`  Title: ${title}`);
    console.log(`  URL: ${url}`);
    await page.screenshot({ path: `${evidencePath}/kimi-platform.png`, fullPage: true });
    console.log('Platform screenshot saved');
    
    // Look for plan info on platform page
    const pageText = await page.$eval('body', el => el.innerText.toLowerCase());
    if (pageText.includes('plan') || pageText.includes('subscription') || pageText.includes('billing')) {
      console.log('  ✓ Found plan/subscription related content');
    }
  } catch (e) {
    console.log('platform.kimi.com failed:', e.message);
  }
  
  // Try kimi.ai (alternative domain)
  console.log('\nTrying kimi.ai...');
  try {
    await page.goto('https://kimi.ai', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const title = await page.title();
    const url = page.url();
    console.log(`kimi.ai:`);
    console.log(`  Title: ${title}`);
    console.log(`  URL: ${url}`);
    await page.screenshot({ path: `${evidencePath}/kimi-ai.png`, fullPage: true });
    console.log('kimi.ai screenshot saved');
  } catch (e) {
    console.log('kimi.ai failed:', e.message);
  }
  
  // Try to extract user name from the profile
  try {
    await page.goto('https://kimi.com', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const userName = await page.$eval('.user-name', el => el.innerText).catch(() => null);
    if (userName) {
      console.log(`\nUser name found: ${userName}`);
    }
  } catch (e) {
    console.log('Could not extract user name');
  }
  
  console.log('\nBrowser will stay open for 15 seconds...');
  await page.waitForTimeout(15000);
  
  await browser.close();
  console.log('Browser closed');
})();
