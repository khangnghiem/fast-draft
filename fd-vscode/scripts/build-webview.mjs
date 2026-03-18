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
 * CANVAS-CORE INJECTION:
 * Shared modules from site/canvas-core/ are injected first (with `export`
 * keywords stripped) to provide the single source of truth for state,
 * render, clipboard, viewport, and shortcut utilities.
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
const canvasCoreDir = join(root, '..', 'site', 'canvas-core');

// Canvas-core shared modules — injected FIRST (before extension modules)
// These provide shared state, render loop, clipboard, viewport, and shortcuts.
const CANVAS_CORE_ORDER = [
  'state.js',
  'render.js',
  'clipboard.js',
  'viewport.js',
  'shortcuts.js',
  'inline-edit.js',
];

// Extension-specific modules — loaded AFTER canvas-core
const MODULE_ORDER = [
  'state.js',       // Extension-specific state (VS Code API, modifier drag, etc.)
  'render.js',      // Extension-specific render additions
  'pointer.js',
  'toolbar.js',
  'sync.js',
  'shortcuts.js',   // Extension-specific shortcut handlers
  'context-menu.js',
  'panels.js',
  'inline-edit.js',
  'navigation.js',
  'clipboard.js',   // Extension-specific clipboard (postMessage bridge)
  'drag-drop.js',
  'ai-chat.js',
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

/** Strip ES module syntax (export/import) so canvas-core works in global scope */
function stripModuleSyntax(content) {
  return content
    .replace(/^export (let|const|function|class|async function) /gm, '$1 ')
    .replace(/^export \{[^}]*\};\s*$/gm, '')
    .replace(/^import \{[^}]*\} from '[^']*';\s*$/gm, '')
    .replace(/^export default /gm, '');
}

// ── Inject canvas-core modules ──
console.log('Canvas-core modules:');
for (const filename of CANVAS_CORE_ORDER) {
  const filePath = join(canvasCoreDir, filename);
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`  SKIP: ${filename} — ${err.message}`);
    continue;
  }
  content = stripModuleSyntax(content);
  output += `// ── canvas-core/${filename} ──\n` + content;
  if (!output.endsWith('\n')) output += '\n';
  const lineCount = content.split('\n').length;
  totalLines += lineCount;
  console.log(`  ${filename}: ${lineCount} lines`);
}

// ── Inject extension-specific modules ──
console.log('Extension modules:');
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

