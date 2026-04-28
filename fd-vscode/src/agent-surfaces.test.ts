import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_SOURCE_PATH,
  REPO_OVERRIDE_PATH,
  auditOverrideContent,
  getSurfaceTarget,
  lintCanonicalContent,
  renderSurface,
  verifyRepoSurfaces,
  writeRepoSurfaces,
} from "./agent-surfaces";

const tempDirs: string[] = [];
const OPTIONAL_GEMINI_DUPLICATE_PATH =
  "zed-extensions/extensions/fast-draft/GEMINI.md";

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

function createFixtureRepo(options?: {
  canonical?: string;
  repoOverride?: string;
  includeOptionalGeminiParent?: boolean;
}): string {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-surfaces-"));
  tempDirs.push(repoRoot);

  fs.mkdirSync(path.join(repoRoot, path.dirname(CANONICAL_SOURCE_PATH)), {
    recursive: true,
  });
  fs.mkdirSync(path.join(repoRoot, path.dirname(REPO_OVERRIDE_PATH)), {
    recursive: true,
  });

  if (options?.includeOptionalGeminiParent) {
    fs.mkdirSync(path.join(repoRoot, path.dirname(OPTIONAL_GEMINI_DUPLICATE_PATH)), {
      recursive: true,
    });
  }

  fs.writeFileSync(
    path.join(repoRoot, CANONICAL_SOURCE_PATH),
    options?.canonical ??
      ["## Shared", "", "- Keep policy aligned across hosts."].join("\n")
  );
  fs.writeFileSync(
    path.join(repoRoot, REPO_OVERRIDE_PATH),
    options?.repoOverride ??
      ["## Repo", "", "- Use pnpm only inside fd-vscode."].join("\n")
  );

  return repoRoot;
}

describe("agent surfaces", () => {
  it("renders host-specific wrappers differently", () => {
    const source = {
      canonical: "CANONICAL_MARKER\n- Shared policy",
      repoOverride: "OVERRIDE_MARKER\n- Repo-only fact",
    };

    const agents = renderSurface(getSurfaceTarget("AGENTS.md"), source);
    const claude = renderSurface(getSurfaceTarget("CLAUDE.md"), source);
    const gemini = renderSurface(getSurfaceTarget("GEMINI.md"), source);

    expect(agents).toContain("Target host: OpenCode / AGENTS.md consumers.");
    expect(claude).toContain("Target host: Claude Code consumers.");
    expect(gemini).toContain("Target host: Gemini CLI consumers.");
    expect(agents.startsWith("---")).toBe(false);
    expect(gemini.startsWith("---\ntrigger: always_on\n---\n")).toBe(true);
  });

  it("renders the generated notice with source references", () => {
    const rendered = renderSurface(getSurfaceTarget("AGENTS.md"), {
      canonical: "CANONICAL_MARKER\n- Shared policy",
      repoOverride: "OVERRIDE_MARKER\n- Repo-only fact",
    });

    expect(rendered).toContain("GENERATED FILE — DO NOT EDIT DIRECTLY.");
    expect(rendered).toContain(CANONICAL_SOURCE_PATH);
    expect(rendered).toContain(REPO_OVERRIDE_PATH);
    expect(rendered).toContain("npm run render:agent-surfaces");
    expect(rendered).toContain("npm run verify:agent-surfaces");
  });

  it("lints forbidden host tool names from canonical content", () => {
    const issues = lintCanonicalContent([
      "Use Bash for shell work.",
      "Track steps with TodoWrite.",
      "Open a Task for the browser.",
      "Preserve ReusedSubagentId when reusing a browser session.",
    ].join("\n"));

    expect(issues).toEqual([
      expect.objectContaining({ line: 1, term: "Bash" }),
      expect.objectContaining({ line: 2, term: "TodoWrite" }),
      expect.objectContaining({ line: 3, term: "Task" }),
      expect.objectContaining({ line: 4, term: "ReusedSubagentId" }),
    ]);
  });

  it("composes wrapper, canonical core, and repo override in order", () => {
    const rendered = renderSurface(getSurfaceTarget("CLAUDE.md"), {
      canonical: "CANONICAL_MARKER\n- Shared policy",
      repoOverride: "OVERRIDE_MARKER\n- Repo-only fact",
    });

    const wrapperIndex = rendered.indexOf("Target host: Claude Code consumers.");
    const canonicalIndex = rendered.indexOf("CANONICAL_MARKER");
    const overrideIndex = rendered.indexOf("OVERRIDE_MARKER");

    expect(wrapperIndex).toBeGreaterThan(-1);
    expect(canonicalIndex).toBeGreaterThan(wrapperIndex);
    expect(overrideIndex).toBeGreaterThan(canonicalIndex);
  });

  it("audits non-empty repo-only override content", () => {
    const audit = auditOverrideContent([
      "## Repo Facts",
      "",
      "- Use pnpm only inside fd-vscode.",
      "- Never push directly to main.",
    ].join("\n"));

    expect(audit.hasContent).toBe(true);
    expect(audit.nonEmptyLineCount).toBe(3);
    expect(audit.summary).toContain("3 non-empty content lines");
    expect(audit.preview).toEqual([
      "## Repo Facts",
      "- Use pnpm only inside fd-vscode.",
      "- Never push directly to main.",
    ]);
  });

  it("renders repo surfaces idempotently for a representative fixture", () => {
    const repoRoot = createFixtureRepo();

    const first = writeRepoSurfaces(repoRoot);
    const second = writeRepoSurfaces(repoRoot);
    const report = verifyRepoSurfaces(repoRoot);

    expect(first.some((result) => result.changed)).toBe(true);
    expect(second.every((result) => !result.changed)).toBe(true);
    expect(first.map((result) => result.relativePath)).not.toContain(
      OPTIONAL_GEMINI_DUPLICATE_PATH
    );
    expect(report.ok).toBe(true);
    expect(report.idempotent).toBe(true);
    expect(report.staleOutputs).toEqual([]);
  });

  it("renders the duplicate Gemini target when its parent path exists", () => {
    const repoRoot = createFixtureRepo({ includeOptionalGeminiParent: true });

    const results = writeRepoSurfaces(repoRoot);

    expect(results.map((result) => result.relativePath)).toContain(
      OPTIONAL_GEMINI_DUPLICATE_PATH
    );
    expect(
      fs.existsSync(path.join(repoRoot, OPTIONAL_GEMINI_DUPLICATE_PATH))
    ).toBe(true);
  });

  it("fails verification when outputs are stale", () => {
    const repoRoot = createFixtureRepo();
    writeRepoSurfaces(repoRoot);

    fs.writeFileSync(path.join(repoRoot, "AGENTS.md"), "stale output\n");

    const report = verifyRepoSurfaces(repoRoot);

    expect(report.ok).toBe(false);
    expect(report.idempotent).toBe(false);
    expect(report.staleOutputs).toContain("AGENTS.md");
  });

  it("fails verification when the repo override is empty", () => {
    const repoRoot = createFixtureRepo({ repoOverride: "\n  \n" });
    writeRepoSurfaces(repoRoot);

    const report = verifyRepoSurfaces(repoRoot);

    expect(report.ok).toBe(false);
    expect(report.idempotent).toBe(true);
    expect(report.overrideAudit.hasContent).toBe(false);
    expect(report.overrideAudit.summary).toBe("Repo override is empty.");
  });

  it("fails rendering and short-circuits stale-output checks when canonical lint fails", () => {
    const repoRoot = createFixtureRepo({
      canonical: "Use Bash for shell work.",
    });

    expect(() => writeRepoSurfaces(repoRoot)).toThrow("Canonical lint failed:");

    fs.writeFileSync(path.join(repoRoot, "AGENTS.md"), "stale output\n");

    const report = verifyRepoSurfaces(repoRoot);

    expect(report.ok).toBe(false);
    expect(report.idempotent).toBe(true);
    expect(report.lintIssues).toEqual([
      expect.objectContaining({ line: 1, term: "Bash" }),
    ]);
    expect(report.staleOutputs).toEqual([]);
  });
});
