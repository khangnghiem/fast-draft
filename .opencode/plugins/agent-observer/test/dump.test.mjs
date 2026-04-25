import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runObserverDumpCli, summarizeStuckSessions } from "../dump.js";

async function withTempDir(run) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "observer-dump-"));

  try {
    return await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("summarizeStuckSessions returns unresolved stuck sessions", () => {
  const summary = summarizeStuckSessions([
    {
      sessionId: "ses_1",
      kind: "plan.stuck",
      ts: "2026-04-25T00:00:00.000Z",
      attrs: { reason: "waiting_permission" }
    }
  ]);

  assert.equal(summary[0].sessionId, "ses_1");
  assert.equal(summary[0].resolved, false);
});

test("summarizeStuckSessions reopens when a later plan.stuck appears", () => {
  const summary = summarizeStuckSessions([
    {
      sessionId: "ses_2",
      kind: "plan.stuck",
      ts: "2026-04-25T00:00:00.000Z",
      attrs: { reason: "waiting_permission" }
    },
    {
      sessionId: "ses_2",
      kind: "plan.resolved",
      ts: "2026-04-25T00:01:00.000Z",
      attrs: { previousReason: "waiting_permission" }
    },
    {
      sessionId: "ses_2",
      kind: "plan.stuck",
      ts: "2026-04-25T00:02:00.000Z",
      attrs: { reason: "repeat_tool_loop" }
    }
  ]);

  assert.equal(summary[0].sessionId, "ses_2");
  assert.equal(summary[0].resolved, false);
  assert.equal(summary[0].reason, "repeat_tool_loop");
  assert.equal(summary[0].startedAt, "2026-04-25T00:02:00.000Z");
  assert.equal(summary[0].resolvedAt, null);
});

test("runObserverDumpCli returns exit code 1 for unresolved stuck sessions", async () => {
  await withTempDir(async (rootDir) => {
    const telemetryDir = path.join(rootDir, ".opencode", "telemetry");
    await mkdir(telemetryDir, { recursive: true });

    const filePath = path.join(telemetryDir, "events-2026-04-25.jsonl");
    await writeFile(
      filePath,
      `${JSON.stringify({
        sessionId: "ses_3",
        kind: "plan.stuck",
        ts: "2026-04-25T00:00:00.000Z",
        attrs: { reason: "waiting_permission" }
      })}\n`,
      "utf8"
    );

    const output = [];
    const exitCode = await runObserverDumpCli(["--stuck-only", "--format", "json"], {
      cwd: rootDir,
      stdout: (line) => output.push(line),
      stderr: () => {}
    });

    assert.equal(exitCode, 1);
    const parsed = JSON.parse(output.join("\n"));
    assert.equal(parsed[0].sessionId, "ses_3");
    assert.equal(parsed[0].resolved, false);
    assert.equal(parsed[0].reason, "waiting_permission");
  });
});

test("runObserverDumpCli uses injected now once for --since filtering", async () => {
  await withTempDir(async (rootDir) => {
    const telemetryDir = path.join(rootDir, ".opencode", "telemetry");
    await mkdir(telemetryDir, { recursive: true });

    const filePath = path.join(telemetryDir, "events-2026-04-25.jsonl");
    await writeFile(
      filePath,
      [
        {
          sessionId: "ses_recent",
          kind: "plan.stuck",
          ts: "2026-04-25T00:59:00.000Z",
          attrs: { reason: "waiting_permission" }
        },
        {
          sessionId: "ses_old",
          kind: "plan.stuck",
          ts: "2026-04-24T23:00:00.000Z",
          attrs: { reason: "busy_no_progress" }
        }
      ]
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
      "utf8"
    );

    let nowCalls = 0;
    const output = [];
    const exitCode = await runObserverDumpCli(["--since", "1h", "--format", "json"], {
      cwd: rootDir,
      now: () => {
        nowCalls += 1;
        return Date.parse("2026-04-25T01:00:00.000Z");
      },
      stdout: (line) => output.push(line),
      stderr: () => {}
    });

    assert.equal(exitCode, 0);
    assert.equal(nowCalls, 1);

    const parsed = JSON.parse(output.join("\n"));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].sessionId, "ses_recent");
  });
});

test("runObserverDumpCli applies --session filter", async () => {
  await withTempDir(async (rootDir) => {
    const telemetryDir = path.join(rootDir, ".opencode", "telemetry");
    await mkdir(telemetryDir, { recursive: true });

    const filePath = path.join(telemetryDir, "events-2026-04-25.jsonl");
    await writeFile(
      filePath,
      [
        {
          sessionId: "ses_target",
          kind: "plan.stuck",
          ts: "2026-04-25T00:00:00.000Z",
          attrs: { reason: "waiting_permission" }
        },
        {
          sessionId: "ses_other",
          kind: "plan.stuck",
          ts: "2026-04-25T00:01:00.000Z",
          attrs: { reason: "repeat_tool_loop" }
        }
      ]
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
      "utf8"
    );

    const output = [];
    const exitCode = await runObserverDumpCli(["--session", "ses_target", "--format", "json"], {
      cwd: rootDir,
      stdout: (line) => output.push(line),
      stderr: () => {}
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(output.join("\n"));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].sessionId, "ses_target");
  });
});

test("runObserverDumpCli returns 0 when telemetry directory is missing", async () => {
  await withTempDir(async (rootDir) => {
    const output = [];
    const exitCode = await runObserverDumpCli(["--stuck-only", "--format", "table"], {
      cwd: rootDir,
      stdout: (line) => output.push(line),
      stderr: () => {}
    });

    assert.equal(exitCode, 0);
    assert.equal(output.at(-1), "No unresolved stuck sessions.");
  });
});
