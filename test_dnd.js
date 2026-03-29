const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Capture page console
    page.on('console', msg => console.log(`[PAGE LOG] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}`));
    
    await page.goto('http://localhost:8080');
    
    // Wait for canvas to init
    await page.waitForTimeout(2000);
    
    // Clear the canvas via API
    await page.evaluate(() => {
        window.fdCanvas.set_text("group @g1 {\n  text @t1 \"Hello\"\n}\nrect @r1 {\n  w: 100 h: 100\n}");
        window.api.syncCanvasToEditor();
        window.api.renderCanvas();
        window.refreshLayersPanel();
    });
    
    await page.waitForTimeout(500);
    
    // Drag "t1" to "r1" (nesting t1 inside r1)
    await page.evaluate(() => {
        const source = document.querySelector('.layer-item[data-node-id="t1"]');
        const target = document.querySelector('.layer-item[data-node-id="r1"]');
        
        console.log("Source found:", !!source);
        console.log("Target found:", !!target);
        
        const dataTransfer = new DataTransfer();
        
        const dragStart = new DragEvent('dragstart', { dataTransfer, bubbles: true });
        source.dispatchEvent(dragStart);
        
        // Target is r1
        const dragOver = new DragEvent('dragover', { dataTransfer, bubbles: true, clientY: target.getBoundingClientRect().top + (target.getBoundingClientRect().height / 2) });
        target.dispatchEvent(dragOver);
        
        const drop = new DragEvent('drop', { dataTransfer, bubbles: true, clientY: target.getBoundingClientRect().top + (target.getBoundingClientRect().height / 2) });
        target.dispatchEvent(drop);
    });
    
    await page.waitForTimeout(500);
    
    // Output the resulting text content
    const text = await page.evaluate(() => window.fdCanvas.get_text());
    console.log("--- RESULTING FD SOURCE ---");
    console.log(text);
    console.log("---------------------------");

    await browser.close();
})();
