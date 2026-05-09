import { chromium } from 'playwright';
import { execSync } from 'child_process';

const evidencePath = execSync('evidence-path').toString().trim();

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Browser launched in headed mode');
  
  // Navigate to kimi.com
  await page.goto('https://kimi.com', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Navigated to kimi.com');
  
  // Check cookies to see if logged in
  const cookies = await context.cookies();
  console.log('Cookies:', JSON.stringify(cookies.map(c => ({ name: c.name, domain: c.domain })), null, 2));
  
  // Check localStorage
  const localStorage = await page.evaluate(() => {
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      items[key] = localStorage.getItem(key);
    }
    return items;
  });
  console.log('localStorage keys:', Object.keys(localStorage));
  
  // Take initial screenshot
  await page.screenshot({ path: `${evidencePath}/kimi-initial.png`, fullPage: true });
  
  // Get all buttons and links on the page
  const allElements = await page.$$eval('button, a, [role="button"]', elements =>
    elements.map(el => ({
      tag: el.tagName,
      text: el.innerText?.trim() || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      className: el.className || '',
      href: el.href || ''
    })).filter(el => el.text || el.ariaLabel)
  );
  console.log('All interactive elements:', JSON.stringify(allElements, null, 2));
  
  // Try to find and click sidebar with more specific selector
  // Look for the first button in the top-left area
  const sidebarButton = await page.$('button');
  if (sidebarButton) {
    console.log('Clicking first button (likely sidebar)...');
    await sidebarButton.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${evidencePath}/kimi-sidebar-open.png`, fullPage: true });
    console.log('Sidebar open screenshot saved');
    
    // Check what's in the sidebar
    const sidebarContent = await page.$$eval('nav, aside, [class*="sidebar"], [class*="drawer"], [role="navigation"]', elements =>
      elements.map(el => ({
        tag: el.tagName,
        text: el.innerText?.substring(0, 500) || '',
        className: el.className || ''
      }))
    );
    console.log('Sidebar content:', JSON.stringify(sidebarContent, null, 2));
  }
  
  // Try to check if user is logged in by looking for avatar or profile elements
  const avatarElements = await page.$$eval('img[src*="avatar"], [class*="avatar"], [class*="profile"], [class*="user"]', elements =>
    elements.map(el => ({
      tag: el.tagName,
      className: el.className || '',
      src: el.src || ''
    }))
  );
  console.log('Avatar/Profile elements:', JSON.stringify(avatarElements, null, 2));
  
  // Try app.kimi.com or platform.kimi.com
  console.log('\nTrying alternative URLs...');
  const altUrls = [
    'https://app.kimi.com',
    'https://platform.kimi.com',
    'https://www.kimi.com/login',
    'https://www.kimi.com/auth'
  ];
  
  for (const url of altUrls) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      const title = await page.title();
      const currentUrl = page.url();
      console.log(`\n${url}:`);
      console.log(`  Title: ${title}`);
      console.log(`  Final URL: ${currentUrl}`);
      
      if (currentUrl !== 'https://www.kimi.com/') {
        const filename = url.replace(/https:\/\//, '').replace(/\//g, '-');
        await page.screenshot({ path: `${evidencePath}/kimi-${filename}.png`, fullPage: true });
        console.log(`  Screenshot saved`);
        
        // Look for login form
        const hasLoginForm = await page.$('input[type="email"], input[type="password"], input[name="email"], button:has-text("Log")') !== null;
        if (hasLoginForm) {
          console.log('  ✓ Login form detected!');
        }
      }
    } catch (e) {
      console.log(`  ${url}: ${e.message}`);
    }
  }
  
  // Navigate back to main page for final screenshot
  await page.goto('https://kimi.com', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${evidencePath}/kimi-final.png`, fullPage: true });
  
  console.log('\nBrowser will stay open for 10 seconds...');
  await page.waitForTimeout(10000);
  
  await browser.close();
  console.log('Browser closed');
})();
