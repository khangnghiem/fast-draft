#!/usr/bin/env node
/**
 * Split main.js into modules for the FD webview.
 * 
 * Reads the monolithic webview/main.js and splits it into:
 *   webview/src/state.js       — Global state & constants
 *   webview/src/render.js      — Rendering, tween engine, animations
 *   webview/src/pointer.js     — Pointer event handlers (draw, select, move, resize)
 *   webview/src/toolbar.js     — Toolbar setup, drag-to-create, tooltips  
 *   webview/src/sync.js        — Message bridge (Extension ↔ Webview)
 *   webview/src/shortcuts.js   — Keyboard shortcuts, nudge, Apple Pencil
 *   webview/src/panels.js      — Layers, Properties, Spec, Library panels
 *   webview/src/inline-edit.js — Inline text editor
 *   webview/src/context-menu.js — Right-click menus, annotation card, FAB
 *   webview/src/navigation.js  — Zoom, pan, minimap, focus, grid
 *   webview/src/clipboard.js   — Copy/paste/select-all, PNG export
 *   webview/src/utils.js       — Shared helpers (escapeHtml, etc.)
 *   webview/src/main.js        — Entry point: import all + main()
 * 
 * Usage: node scripts/split-main.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mainPath = join(root, 'webview', 'main.js');
const srcDir = join(root, 'webview', 'src');

// Read entire file
const lines = readFileSync(mainPath, 'utf8').split('\n');
const total = lines.length;

console.log(`Read ${total} lines from main.js`);

// ---
// Section map: each entry is [startLine (1-indexed), moduleName]
// Lines between sections belong to the preceding module.
// ---
const sectionMap = [
  // state.js — globals, constants, tool defaults
  [1, 'state'],        // Start of file through line ~214
  
  // render.js — tween engine + rendering + animations  
  [215, 'render'],     // Tween Engine through line ~621
  
  // main.js — initialization (main function + setup)
  [326, 'main-init'],  // Initialization through line ~419
  
  // pointer.js — pointer events + touch + resize
  [622, 'pointer'],    // Pointer Events through line ~1263
  
  // resize.js (part of pointer) 
  [1264, 'pointer-resize'], // Resize section
  
  // toolbar.js
  [1290, 'toolbar'],   // Toolbar through line ~1383
  
  // sync.js — message bridge
  [1384, 'sync'],      // Message Bridge through line ~1451
  
  // shortcuts.js — keyboard + Apple Pencil + help overlay
  [1452, 'shortcuts'], // Keyboard shortcuts through ~1880
  
  // help overlay (part of shortcuts)
  [1881, 'shortcuts-help'],
  
  // context-menu.js — annotation card + FAB + delete + context menu
  [2021, 'context-menu'],
  
  // properties.js — properties panel + alignment grid
  [2716, 'panels-properties'],
  
  // inline-edit.js — inline text editor  
  [2882, 'inline-edit'],
  
  // drag-drop + animation picker
  [3282, 'drag-drop'],
  
  // view-mode.js
  [3514, 'view-mode'],
  
  // layers panel
  [3766, 'panels-layers'],
  
  // spec summary panel + spec view parser
  [3903, 'panels-spec'],
  
  // help/theme/sketchy/zen toggles
  [4336, 'toggles'],
  
  // dimension tooltip + zoom helpers
  [4443, 'navigation'],
  
  // edge context menu  
  [5271, 'edge-menu'],
  
  // nudge
  [5474, 'nudge'],
  
  // export PNG
  [5514, 'export'],
  
  // minimap
  [5666, 'minimap'],
  
  // smart focus + zoom to selection
  [5889, 'focus'],
  
  // color swatches
  [6036, 'swatches'],
  
  // layer visibility
  [6106, 'layer-visibility'],
  
  // library panel
  [6134, 'library'],
  
  // copy/paste/select all + PNG clipboard
  [6242, 'clipboard'],
  
  // start
  [6425, 'start'],
];

// Group sections into target modules
const moduleGroups = {
  'state.js':        ['state'],
  'render.js':       ['render'],
  'pointer.js':      ['pointer', 'pointer-resize'],
  'toolbar.js':      ['toolbar'],
  'sync.js':         ['sync'],
  'shortcuts.js':    ['shortcuts', 'shortcuts-help', 'nudge'],
  'context-menu.js': ['context-menu', 'edge-menu'],
  'panels.js':       ['panels-properties', 'panels-layers', 'panels-spec', 'swatches', 'layer-visibility', 'library'],
  'inline-edit.js':  ['inline-edit'],
  'navigation.js':   ['navigation', 'minimap', 'focus', 'toggles'],
  'clipboard.js':    ['clipboard', 'export'],
  'drag-drop.js':    ['drag-drop', 'view-mode'],
  'main.js':         ['main-init', 'start'],
};

// Sort sections by line number
const sorted = [...sectionMap].sort((a, b) => a[0] - b[0]);

// Extract ranges for each section name
const sectionRanges = {};
for (let i = 0; i < sorted.length; i++) {
  const [startLine, name] = sorted[i];
  const endLine = i + 1 < sorted.length ? sorted[i + 1][0] - 1 : total;
  sectionRanges[name] = { start: startLine - 1, end: endLine }; // Convert to 0-indexed
}

// Create source directory
if (!existsSync(srcDir)) {
  mkdirSync(srcDir, { recursive: true });
}

// Write each module
let totalWritten = 0;
for (const [filename, sectionNames] of Object.entries(moduleGroups)) {
  const moduleLines = [];
  
  // Add module header
  moduleLines.push(`// ─── ${filename} ─── Auto-extracted from main.js`);
  moduleLines.push(`// This file is part of the FD webview module system.`);
  moduleLines.push(`// Build with: pnpm run build:webview`);
  moduleLines.push('');
  
  for (const sectionName of sectionNames) {
    const range = sectionRanges[sectionName];
    if (!range) {
      console.warn(`  WARNING: Section "${sectionName}" not found`);
      continue;
    }
    const chunk = lines.slice(range.start, range.end);
    moduleLines.push(...chunk);
    moduleLines.push('');
  }
  
  const outPath = join(srcDir, filename);
  writeFileSync(outPath, moduleLines.join('\n'));
  const lineCount = moduleLines.length;
  totalWritten += lineCount;
  console.log(`  ${filename}: ${lineCount} lines`);
}

console.log(`\nTotal lines written: ${totalWritten}`);
console.log(`Original: ${total} lines`);
console.log(`\nDone! Modules written to ${srcDir}/`);
