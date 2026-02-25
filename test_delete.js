const fs = require('fs');
const fdWasm = require('./fd-vscode/webview/wasm/fd_wasm.js');

async function test() {
  const code = fs.readFileSync('./examples/dark_theme.fd', 'utf-8');
  console.log("Original length:", code.length);

  // The wasm initialization... 
  // wait we need to instantiate it properly
}

test();
