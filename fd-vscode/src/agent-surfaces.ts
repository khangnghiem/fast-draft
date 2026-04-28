import fs from "node:fs";
import path from "node:path";

export const CANONICAL_SOURCE_PATH = ".agents/shared/canonical.md";
export const REPO_OVERRIDE_PATH = ".agents/overrides/repo.md";

export interface RenderSource {
  canonical: string;
  repoOverride: string;
}

export interface SurfaceTarget {
  host: "agents" | "claude" | "gemini";
  relativePath: string;
  title: string;
  adapterTitle: string;
  adapterLines: string[];
  frontMatter?: string;
  optional?: boolean;
}

export interface CanonicalLintIssue {
  line: number;
  term: string;
  message: string;
}

export interface OverrideAudit {
  hasContent: boolean;
  nonEmptyLineCount: number;
  preview: string[];
  summary: string;
}

export interface SurfaceWriteResult {
  relativePath: string;
  changed: boolean;
  bytes: number;
}

export interface SurfaceVerifyReport {
  ok: boolean;
  idempotent: boolean;
  lintIssues: CanonicalLintIssue[];
  overrideAudit: OverrideAudit;
  staleOutputs: string[];
}

const GENERATED_NOTICE = [
  "> [!CAUTION]",
  "> GENERATED FILE — DO NOT EDIT DIRECTLY.",
  `> Edit \`${CANONICAL_SOURCE_PATH}\` and \`${REPO_OVERRIDE_PATH}\`, then run \`npm run render:agent-surfaces\`; verify with \`npm run verify:agent-surfaces\`.`,
].join("\n");

const FORBIDDEN_CANONICAL_TERMS = [
  "Bash",
  "TodoWrite",
  "Task",
  "ReusedSubagentId",
  "browser_subagent",
  "activate_skill",
  "navigate_browser",
  "switch_page",
  "open_url",
  "list_browser_pages",
];

export const SURFACE_TARGETS: SurfaceTarget[] = [
  {
    host: "agents",
    relativePath: "AGENTS.md",
    title: "# AGENTS.md — Fast Draft Agent Surface",
    adapterTitle: "## Host Adapter",
    adapterLines: [
      "Target host: OpenCode / AGENTS.md consumers.",
      "Use OpenCode-native tool names and wrappers when applying the shared policy below.",
      "Keep policy meaning aligned with the Claude and Gemini surfaces.",
    ],
  },
  {
    host: "claude",
    relativePath: "CLAUDE.md",
    title: "# CLAUDE.md — Fast Draft Agent Surface",
    adapterTitle: "## Host Adapter",
    adapterLines: [
      "Target host: Claude Code consumers.",
      "Express the shared policy below with Claude Code conventions and syntax.",
      "Keep policy meaning aligned with the OpenCode and Gemini surfaces.",
    ],
  },
  {
    host: "gemini",
    relativePath: "GEMINI.md",
    title: "# GEMINI.md — Fast Draft Agent Surface",
    adapterTitle: "## Host Adapter",
    frontMatter: ["---", "trigger: always_on", "---"].join("\n"),
    adapterLines: [
      "Target host: Gemini CLI consumers.",
      "Express the shared policy below with Gemini CLI conventions and wrappers.",
      "Keep policy meaning aligned with the OpenCode and Claude surfaces.",
    ],
  },
  {
    host: "gemini",
    relativePath: "zed-extensions/extensions/fast-draft/GEMINI.md",
    title: "# GEMINI.md — Fast Draft Agent Surface",
    adapterTitle: "## Host Adapter",
    frontMatter: ["---", "trigger: always_on", "---"].join("\n"),
    optional: true,
    adapterLines: [
      "Target host: Gemini CLI consumers.",
      "This duplicate surface is rendered from the same shared source as the repo root Gemini file.",
      "Keep policy meaning aligned with the OpenCode and Claude surfaces.",
    ],
  },
];

export function getSurfaceTarget(relativePath: string): SurfaceTarget {
  const target = SURFACE_TARGETS.find(
    (candidate) => candidate.relativePath === relativePath
  );

  if (target) {
    return target;
  }

  throw new Error(`Unknown surface target: ${relativePath}`);
}

export function lintCanonicalContent(
  canonicalContent: string
): CanonicalLintIssue[] {
  const issues: CanonicalLintIssue[] = [];
  const lines = canonicalContent.split("\n");

  lines.forEach((line, index) => {
    FORBIDDEN_CANONICAL_TERMS.forEach((term) => {
      const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`);
      if (!pattern.test(line)) {
        return;
      }

      issues.push({
        line: index + 1,
        term,
        message: `Canonical content must stay host-neutral; found '${term}'.`,
      });
    });
  });

  return issues;
}

export function auditOverrideContent(repoOverride: string): OverrideAudit {
  const nonEmptyLines = repoOverride
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const hasContent = nonEmptyLines.length > 0;
  const summary = hasContent
    ? `Repo override contains ${nonEmptyLines.length} non-empty content lines.`
    : "Repo override is empty.";

  return {
    hasContent,
    nonEmptyLineCount: nonEmptyLines.length,
    preview: nonEmptyLines.slice(0, 3),
    summary,
  };
}

export function renderSurface(
  target: SurfaceTarget,
  source: RenderSource
): string {
  const sections = [
    target.title,
    GENERATED_NOTICE,
    renderAdapterSection(target),
    renderSharedSection(source.canonical),
    renderOverrideSection(source.repoOverride),
  ];

  const body = sections.map(normalizeMarkdown).join("\n\n---\n\n");

  if (!target.frontMatter) {
    return `${body}\n`;
  }

  return `${target.frontMatter}\n\n${body}\n`;
}

export function writeRepoSurfaces(repoRoot: string): SurfaceWriteResult[] {
  const source = loadRenderSource(repoRoot);
  const lintIssues = lintCanonicalContent(source.canonical);

  if (lintIssues.length > 0) {
    throw new Error(formatLintIssues(lintIssues));
  }

  return getRepoSurfaceTargets(repoRoot).map((target) => {
    const absolutePath = path.join(repoRoot, target.relativePath);
    const rendered = renderSurface(target, source);

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

    const existing = readFileIfPresent(absolutePath);
    const changed = existing !== rendered;

    if (changed) {
      fs.writeFileSync(absolutePath, rendered, "utf8");
    }

    return {
      relativePath: target.relativePath,
      changed,
      bytes: Buffer.byteLength(rendered, "utf8"),
    };
  });
}

export function verifyRepoSurfaces(repoRoot: string): SurfaceVerifyReport {
  const source = loadRenderSource(repoRoot);
  const lintIssues = lintCanonicalContent(source.canonical);
  const overrideAudit = auditOverrideContent(source.repoOverride);

   if (lintIssues.length > 0) {
    return {
      ok: false,
      idempotent: true,
      lintIssues,
      overrideAudit,
      staleOutputs: [],
    };
  }

  const staleOutputs = getRepoSurfaceTargets(repoRoot).filter((target) => {
    const absolutePath = path.join(repoRoot, target.relativePath);
    const rendered = renderSurface(target, source);
    return readFileIfPresent(absolutePath) !== rendered;
  }).map((target) => target.relativePath);

  const idempotent = staleOutputs.length === 0;
  const ok = lintIssues.length === 0 && overrideAudit.hasContent && idempotent;

  return {
    ok,
    idempotent,
    lintIssues,
    overrideAudit,
    staleOutputs,
  };
}

function renderAdapterSection(target: SurfaceTarget): string {
  const lines = [target.adapterTitle, "", ...target.adapterLines];
  return lines.join("\n");
}

function getRepoSurfaceTargets(repoRoot: string): SurfaceTarget[] {
  return SURFACE_TARGETS.filter((target) =>
    isSurfaceTargetEnabled(target, repoRoot)
  );
}

function isSurfaceTargetEnabled(target: SurfaceTarget, repoRoot: string): boolean {
  if (!target.optional) {
    return true;
  }

  const absolutePath = path.join(repoRoot, target.relativePath);
  return fs.existsSync(absolutePath) || fs.existsSync(path.dirname(absolutePath));
}

function renderSharedSection(canonical: string): string {
  const body = normalizeMarkdown(canonical);
  return [`## Shared Canonical Policy`, "", body].join("\n");
}

function renderOverrideSection(repoOverride: string): string {
  const body = normalizeMarkdown(repoOverride);
  return [`## Repo Override Appendix`, "", body].join("\n");
}

function loadRenderSource(repoRoot: string): RenderSource {
  return {
    canonical: readRequiredUtf8(
      path.join(repoRoot, CANONICAL_SOURCE_PATH),
      CANONICAL_SOURCE_PATH
    ),
    repoOverride: readRequiredUtf8(
      path.join(repoRoot, REPO_OVERRIDE_PATH),
      REPO_OVERRIDE_PATH
    ),
  };
}

function readRequiredUtf8(filePath: string, relativePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing surface source: ${relativePath}. Create the shared canonical and repo override files before rendering or verifying.`
    );
  }

  return fs.readFileSync(filePath, "utf8");
}

function readFileIfPresent(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, "utf8");
}

function normalizeMarkdown(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatLintIssues(issues: CanonicalLintIssue[]): string {
  const lines = issues.map(
    (issue) => `- line ${issue.line}: ${issue.message}`
  );

  return ["Canonical lint failed:", ...lines].join("\n");
}
