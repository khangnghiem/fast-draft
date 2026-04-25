import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTelemetryEvent, JsonlTelemetry } from "../telemetry.js";
import { describeValue, hashValue } from "../redact.js";

async function withTempDir(run) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "observer-telemetry-"));

  try {
    return await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function eventWithDate(kind, isoDate, attrs = {}) {
  const event = createTelemetryEvent({
    sessionId: "ses_123",
    kind,
    attrs
  });

  event.ts = isoDate;
  return event;
}

test("createTelemetryEvent hashes payloads and keeps stable metadata", () => {
  const event = createTelemetryEvent({
    sessionId: "ses_123",
    kind: "tool.execute.before",
    planId: "plan-a",
    attrs: {
      argShape: { command: "string(10)" },
      argHash: "abc123"
    }
  });

  assert.equal(event.sessionId, "ses_123");
  assert.equal(event.planId, "plan-a");
  assert.equal(event.kind, "tool.execute.before");
  assert.ok(event.eventId);
  assert.equal(event.attrs.argHash, "abc123");
});

test("createTelemetryEvent preserves metadata and stores hashed payload attrs", () => {
  const toolArgs = {
    command: "printf '%s' hello",
    retries: 2,
    options: {
      cwd: "/tmp"
    }
  };

  const event = createTelemetryEvent({
    sessionId: "ses_telemetry",
    planId: "plan-alpha",
    taskId: "task-42",
    sessionOrigin: "cli",
    surface: "plugin.agent-observer",
    kind: "tool.started",
    status: "ok",
    attrs: {
      tool: "bash",
      argShape: describeValue(toolArgs),
      argHash: hashValue(toolArgs)
    }
  });

  assert.equal(event.sessionId, "ses_telemetry");
  assert.equal(event.planId, "plan-alpha");
  assert.equal(event.taskId, "task-42");
  assert.equal(event.sessionOrigin, "cli");
  assert.equal(event.surface, "plugin.agent-observer");
  assert.equal(event.kind, "tool.started");
  assert.equal(event.status, "ok");
  assert.equal(event.attrs.tool, "bash");
  assert.equal(event.attrs.argHash, hashValue(toolArgs));
  assert.deepEqual(event.attrs.argShape, {
    command: "string(17)",
    options: {
      cwd: "string(4)"
    },
    retries: "number"
  });
});

test("JsonlTelemetry.write recovers after a failed write in the same instance", async () => {
  await withTempDir(async (rootDir) => {
    const logDir = "telemetry";
    const logPath = path.join(rootDir, logDir);
    const telemetry = new JsonlTelemetry({ rootDir, logDir });

    await writeFile(logPath, "not-a-directory", "utf8");
    await assert.rejects(
      telemetry.write(eventWithDate("tool.execute.before", "2026-04-25T00:00:00.000Z"))
    );

    await rm(logPath, { force: true });
    await assert.doesNotReject(
      telemetry.write(eventWithDate("tool.execute.after", "2026-04-25T00:00:00.000Z"))
    );

    const outputPath = path.join(logPath, "events-2026-04-25.jsonl");
    const lines = (await readFile(outputPath, "utf8")).trim().split("\n");
    assert.equal(lines.length, 1);
  });
});

test("JsonlTelemetry.write appends JSONL events into daily file", async () => {
  await withTempDir(async (rootDir) => {
    const telemetry = new JsonlTelemetry({
      rootDir,
      logDir: ".opencode/telemetry"
    });

    await telemetry.write(eventWithDate("tool.execute.before", "2026-04-26T01:00:00.000Z"));
    await telemetry.write(eventWithDate("tool.execute.after", "2026-04-26T01:00:01.000Z"));

    const outputPath = path.join(rootDir, ".opencode/telemetry", "events-2026-04-26.jsonl");
    const lines = (await readFile(outputPath, "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);

    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    assert.equal(first.kind, "tool.execute.before");
    assert.equal(second.kind, "tool.execute.after");
  });
});

test("JsonlTelemetry.write recreates directory after runtime deletion", async () => {
  await withTempDir(async (rootDir) => {
    const logDir = ".opencode/telemetry";
    const logPath = path.join(rootDir, logDir);
    const telemetry = new JsonlTelemetry({ rootDir, logDir });
    const firstEvent = eventWithDate("tool.execute.before", "2026-04-27T01:00:00.000Z");
    const secondEvent = eventWithDate("tool.execute.after", "2026-04-27T01:00:01.000Z");

    await assert.doesNotReject(telemetry.write(firstEvent));
    await rm(logPath, { recursive: true, force: true });
    await assert.doesNotReject(telemetry.write(secondEvent));

    const outputPath = path.join(logPath, "events-2026-04-27.jsonl");
    const lines = (await readFile(outputPath, "utf8")).trim().split("\n");
    assert.equal(lines.length, 1);

    const persisted = JSON.parse(lines[0]);
    assert.equal(persisted.eventId, secondEvent.eventId);
    assert.equal(persisted.kind, "tool.execute.after");
  });
});
