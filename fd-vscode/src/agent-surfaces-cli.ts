import path from "node:path";
import {
  verifyRepoSurfaces,
  writeRepoSurfaces,
} from "./agent-surfaces";

type Command = "render" | "verify";

function main(): void {
  const command = parseCommand(process.argv[2]);
  const repoRoot = path.resolve(__dirname, "../..");

  if (command === "render") {
    const results = writeRepoSurfaces(repoRoot);
    results.forEach((result) => {
      const status = result.changed ? "updated" : "unchanged";
      process.stdout.write(`${status}: ${result.relativePath}\n`);
    });
    return;
  }

  const report = verifyRepoSurfaces(repoRoot);

  process.stdout.write(
    `canonical lint issues: ${report.lintIssues.length}\n`
  );
  process.stdout.write(`${report.overrideAudit.summary}\n`);
  process.stdout.write(
    `render idempotent: ${report.idempotent ? "yes" : "no"}\n`
  );

  if (report.lintIssues.length > 0) {
    process.stdout.write("canonical lint details:\n");
    report.lintIssues.forEach((issue) => {
      process.stdout.write(`- line ${issue.line}: ${issue.message}\n`);
    });
  }

  if (report.staleOutputs.length > 0) {
    process.stdout.write("stale outputs:\n");
    report.staleOutputs.forEach((relativePath) => {
      process.stdout.write(`- ${relativePath}\n`);
    });
  } else {
    process.stdout.write("stale outputs: none\n");
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

function parseCommand(value: string | undefined): Command {
  if (value === "render" || value === "verify") {
    return value;
  }

  throw new Error("Expected command: render | verify");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
