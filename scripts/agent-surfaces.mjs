#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const command = process.argv[2];

if (command !== "render" && command !== "verify") {
  console.error("Expected command: render | verify");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const fdVscodeRoot = path.join(repoRoot, "fd-vscode");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const result = spawnSync(
  pnpmCommand,
  ["run", `${command}:agent-surfaces`],
  {
    cwd: fdVscodeRoot,
    stdio: "inherit",
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
