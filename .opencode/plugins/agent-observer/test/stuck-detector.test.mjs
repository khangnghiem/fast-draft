import test from "node:test";
import assert from "node:assert/strict";
import { StuckDetector } from "../stuck-detector.js";

test("emits plan.stuck after permission timeout", () => {
  const detector = new StuckDetector({ permissionTimeoutMs: 1000, now: () => 0 });

  detector.record({ kind: "permission.asked", sessionId: "ses_1", at: 0 });
  const events = detector.tick(1001);

  assert.equal(events[0].kind, "plan.stuck");
  assert.equal(events[0].attrs.reason, "waiting_permission");
});

test("emits idle_with_pending_todos after idle timeout with pending todos", () => {
  const detector = new StuckDetector({
    stuckThresholdMs: 1000,
    idleThresholdMs: 1000,
    now: () => 0
  });

  detector.record({ kind: "todo.updated", sessionId: "ses_idle", at: 0, attrs: { hasPendingTodos: true } });
  detector.record({ kind: "session.status", sessionId: "ses_idle", at: 0, attrs: { type: "idle" } });
  const events = detector.tick(1001);

  assert.equal(events[0].kind, "plan.stuck");
  assert.equal(events[0].attrs.reason, "idle_with_pending_todos");
});

test("uses idleThresholdMs for idle_with_pending_todos before stuckThresholdMs", () => {
  const detector = new StuckDetector({
    idleThresholdMs: 500,
    stuckThresholdMs: 1000,
    now: () => 0
  });

  detector.record({ kind: "todo.updated", sessionId: "ses_idle_cfg", at: 0, attrs: { hasPendingTodos: true } });
  detector.record({ kind: "session.status", sessionId: "ses_idle_cfg", at: 0, attrs: { type: "idle" } });

  const preIdleEvents = detector.tick(499);
  assert.equal(preIdleEvents.length, 0);

  const atIdleThreshold = detector.tick(501);
  assert.equal(atIdleThreshold[0].kind, "plan.stuck");
  assert.equal(atIdleThreshold[0].attrs.reason, "idle_with_pending_todos");
  assert.equal(atIdleThreshold[0].attrs.inactivityMs, 501);
});

test("emits post_compaction_no_progress after compaction timeout", () => {
  const detector = new StuckDetector({ compactionTimeoutMs: 1000, now: () => 0 });

  detector.record({ kind: "compaction.completed", sessionId: "ses_compact", at: 0, attrs: {} });
  const events = detector.tick(1001);

  assert.equal(events[0].kind, "plan.stuck");
  assert.equal(events[0].attrs.reason, "post_compaction_no_progress");
});

test("emits plan.resolved once progress resumes", () => {
  const detector = new StuckDetector({ stuckThresholdMs: 1000, now: () => 0 });

  detector.record({ kind: "todo.updated", sessionId: "ses_2", at: 0, attrs: { hasPendingTodos: true } });
  detector.record({ kind: "session.status", sessionId: "ses_2", at: 0, attrs: { type: "busy" } });
  detector.tick(1001);
  const events = detector.record({ kind: "tool.finished", sessionId: "ses_2", at: 1100, attrs: { tool: "bash" } });

  assert.equal(events.at(-1).kind, "plan.resolved");
});

test("does not emit duplicate plan.stuck while still stuck", () => {
  const detector = new StuckDetector({ permissionTimeoutMs: 1000, now: () => 0 });

  detector.record({ kind: "permission.asked", sessionId: "ses_3", at: 0 });
  const firstTick = detector.tick(1001);
  const secondTick = detector.tick(2000);

  assert.equal(firstTick.length, 1);
  assert.equal(firstTick[0].kind, "plan.stuck");
  assert.equal(secondTick.length, 0);
});

test("emits repeat_tool_loop when same tool and args repeat", () => {
  const detector = new StuckDetector({ repeatToolThreshold: 3, repeatToolWindowMs: 1000, now: () => 0 });

  detector.record({
    kind: "tool.started",
    sessionId: "ses_4",
    at: 0,
    attrs: { tool: "bash", argHash: "abc123" }
  });
  detector.record({
    kind: "tool.started",
    sessionId: "ses_4",
    at: 200,
    attrs: { tool: "bash", argHash: "abc123" }
  });
  const events = detector.record({
    kind: "tool.started",
    sessionId: "ses_4",
    at: 400,
    attrs: { tool: "bash", argHash: "abc123" }
  });

  assert.equal(events.at(-1).kind, "plan.stuck");
  assert.equal(events.at(-1).attrs.reason, "repeat_tool_loop");
});
