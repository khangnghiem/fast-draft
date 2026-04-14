import { readFileSync } from 'fs';
import init, { FdCanvas } from './site/wasm/fd_wasm.js';

async function run() {
    const wasm = readFileSync('./site/wasm/fd_wasm_bg.wasm');
    await init(wasm);
    const canvas = new FdCanvas(800, 600);
    const text = 'rect { width: red }';
    console.log("diagnostics:", canvas.get_diagnostics_for_source(text));
}
run().catch(console.error);
