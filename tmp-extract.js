const fs = require('fs');

const startLine = 1973; // inclusive
const endLine = 2786; // inclusive

const appJsString = fs.readFileSync('site/app.js', 'utf8');
const lines = appJsString.split('\n');

const extractBlock = lines.slice(startLine - 1, endLine).join('\n');

const apiMap = [
  ['fdCanvas', 'api.getFdCanvas()'],
  ['renderDirty = true', 'api.markRenderDirty()'],
  ['renderDirty', 'api.getRenderDirty()'],
  ['ctxMenu', 'api.ctxMenu'],
  ['copySelectedAsFd', 'api.copySelectedAsFd'],
  ['cutSelectedAsFd', 'api.cutSelectedAsFd'],
  ['pasteFromClipboard', 'api.pasteFromClipboard'],
  ['renderCanvas', 'api.renderCanvas'],
  ['syncCanvasToEditor', 'api.syncCanvasToEditor'],
  ['updatePropertiesPanel', 'api.updatePropertiesPanel'],
  ['showToast', 'api.showToast'],
  ['toggleLayersPanel', 'api.toggleLayersPanel'],
  ['updateFab', 'api.updateFab']
];

let layerCode = extractBlock;
for (const [v, repl] of apiMap) {
  if (v === 'renderDirty = true') {
    layerCode = layerCode.replace(/renderDirty\s*=\s*true/g, repl);
  } else {
    const re = new RegExp(`\\b${v}\\b`, 'g');
    layerCode = layerCode.replace(re, repl);
  }
}

const finalLayerFile = `// ── Layers Panel ──────────────────────────────────────────────────────────
// Handles layer tree rendering, hierarchical drag-and-drop, and context menus.

export function initLayersPanel(api) {
${layerCode.split('\n').map(l => '  ' + l).join('\n')}

  return { refreshLayersPanel };
}
`;

fs.writeFileSync('site/layers.js', finalLayerFile);

// Remove extracted lines from app.js
lines.splice(startLine - 1, endLine - startLine + 1, 
  "    // Layers Panel logic extracted to site/layers.js",
  "    // refreshLayersPanel is assigned from initLayersPanel(api)"
);

// Add import at the top
const importLine = "import { initLayersPanel } from './layers.js';";
lines.unshift(importLine);

fs.writeFileSync('site/app.js', lines.join('\n'));
console.log("Extraction complete!");
