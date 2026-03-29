const { performance } = require('perf_hooks');

const text = "rect @foo\n" + "rect @bar\n".repeat(5000);
const idRegex = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;

function timeStringMatchAll() {
  const start = performance.now();
  const nodes = [];
  for (const m of text.matchAll(idRegex)) {
      nodes.push(m[1]);
  }
  const end = performance.now();
  console.log("String.matchAll:", end - start, "ms", "count:", nodes.length);
}

function timeRegexExecLoop() {
  const start = performance.now();
  const nodes = [];
  let m;
  while ((m = idRegex.exec(text)) !== null) {
      nodes.push(m[1]);
  }
  const end = performance.now();
  console.log("exec loop:", end - start, "ms", "count:", nodes.length);
}

timeStringMatchAll();
timeRegexExecLoop();
