const fs = require('fs');

function checkFile(path) {
    const text = fs.readFileSync(path, 'utf8');
    const regex = /<button[^>]*>/gi;
    let match;
    const missing = [];
    while ((match = regex.exec(text)) !== null) {
        const btn = match[0];
        // If it doesn't have an aria-label and has a title but no text inside it or only an svg, we might need an aria-label.
        // Let's just output buttons that don't have aria-label and have an SVG or just an icon.
        if (!/aria-label/i.test(btn) && (btn.includes('bl-btn') || btn.includes('qcp-dot') || btn.includes('fab-delete-btn') || btn.includes('canvas-chrome-btn'))) {
           missing.push(btn);
        }
    }
    console.log(`Missing aria-labels in ${path}:`);
    missing.forEach(m => console.log(m));
}

checkFile('fd-vscode/src/webview-html.ts');
