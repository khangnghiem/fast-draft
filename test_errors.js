const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
        page.on('response', response => {
            if (!response.ok()) console.log('HTTP ERR', response.status(), response.url());
        });
        
        await page.goto('http://127.0.0.1:8080/site/index.html', {waitUntil: 'networkidle0'});
        await browser.close();
    } catch (e) {
        console.error("Puppeteer Error:", e);
    }
})();
