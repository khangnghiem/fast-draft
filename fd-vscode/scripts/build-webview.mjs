#!/usr/bin/env node
/**
 * Build webview/main.js by concatenating source modules.
 * 
 * WHY concatenation instead of esbuild bundling?
 * VS Code webviews use the vscode-webview:// scheme which breaks ES module
 * resolution. All code runs in a single global scope anyway. Concatenation
 * preserves the original behavior exactly while allowing agents and devs
 * to read/edit smaller focused files.
 * 
 * Usage: node scripts/build-webview.mjs
 *   or:  pnpm run build:webview
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'webview', 'src');
const outPath = join(root, 'webview', 'main.js');

// Module load order matters — state first, main last
const MODULE_ORDER = [
  'state.js',
  'render.js',
  'pointer.js',
  'toolbar.js',
  'sync.js',
  'shortcuts.js',
  'context-menu.js',
  'panels.js',
  'inline-edit.js',
  'navigation.js',
  'clipboard.js',
  'drag-drop.js',
  'main.js',
];

const banner = `/**
 * FD Webview — WASM loader + message bridge.
 *
 * ⚠️  AUTO-GENERATED — do not edit directly.
 * Edit source modules in webview/src/ and run: pnpm run build:webview
 *
 * Loads the Rust WASM module, initializes the FdCanvas, and bridges
 * between the VS Code extension (postMessage) and the WASM engine.
 *
 * NOTE: We use dynamic import() instead of static \`import ... from\`
 * because relative module resolution fails silently in VS Code webviews
 * (the vscode-webview:// resource scheme doesn't support it).
 */
`;

let output = banner;
let totalLines = 0;

for (const filename of MODULE_ORDER) {
  const filePath = join(srcDir, filename);
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`ERROR: Cannot read ${filePath}: ${err.message}`);
    process.exit(1);
  }
  
  // Strip the auto-generated header from each module (first 4 lines)
  const lines = content.split('\n');
  const stripped = lines.slice(4).join('\n');
  
  output += stripped;
  
  // Ensure newline separation
  if (!output.endsWith('\n')) output += '\n';
  
  const lineCount = lines.length - 4;
  totalLines += lineCount;
  console.log(`  ${filename}: ${lineCount} lines`);
}

writeFileSync(outPath, output);
console.log(`\nBuilt webview/main.js: ${totalLines} lines`);
