import { loadObserverConfig } from "./config.js";
import { createTelemetryEvent, JsonlTelemetry } from "./telemetry.js";
import { describeValue, hashValue } from "./redact.js";
import { loadSisyphusState, findSessionMetadata } from "./sisyphus.js";
import { StuckDetector } from "./stuck-detector.js";

const OBSERVER_SERVICE = "agent-observer";
const TERMINAL_TODO_STATES = new Set(["completed", "cancelled", "done"]);
const MAX_METADATA_KEYS = 16;
const MIN_CALL_START_MAX_AGE_MS = 60000;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function safeString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function safeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function safeInteger(value, fallback = 0) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function eventTime(at) {
  const parsed = Number(at);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function timestampIso(at) {
  return new Date(eventTime(at)).toISOString();
}

function pickSessionId(...values) {
  for (const candidate of values) {
    const value = safeString(candidate);
    if (value) {
      return value;
    }
  }

  return null;
}

function extractSessionId(payload) {
  const record = asRecord(payload);

  if (!record) {
    return null;
  }

  const properties = asRecord(record.properties);
  const session = asRecord(record.session);

  return pickSessionId(
    record.sessionId,
    record.sessionID,
    properties?.sessionId,
    properties?.sessionID,
    session?.id,
    session?.sessionID
  );
}

function normalizeTodoEvent(event, at) {
  const properties = asRecord(event?.properties);
  const sessionId = extractSessionId(properties);
  const todos = Array.isArray(properties?.todos) ? properties.todos : [];

  const pendingCount = todos.reduce((count, todo) => {
    const status = safeString(asRecord(todo)?.status)?.toLowerCase() ?? "";
    return TERMINAL_TODO_STATES.has(status) ? count : count + 1;
  }, 0);

  return {
    kind: "todo.updated",
    sessionId,
    at,
    attrs: {
      hasPendingTodos: pendingCount > 0,
      pendingCount,
      todoCount: todos.length
    }
  };
}

function normalizeSessionStatusEvent(event, at) {
  const properties = asRecord(event?.properties);
  const sessionId = extractSessionId(properties);
  const status = asRecord(properties?.status);

  return {
    kind: "session.status",
    sessionId,
    at,
    attrs: {
      type: safeString(status?.type) ?? "unknown"
    }
  };
}

function normalizePermissionResolvedEvent(event, at) {
  const properties = asRecord(event?.properties);
  const sessionId = extractSessionId(properties);

  return {
    kind: "permission.resolved",
    sessionId,
    at,
    attrs: {
      response: safeString(properties?.response) ?? "unknown"
    }
  };
}

function normalizeCompactionCompletedEvent(event, at) {
  const properties = asRecord(event?.properties);

  return {
    kind: "compaction.completed",
    sessionId: extractSessionId(properties),
    at,
    attrs: {}
  };
}

function normalizeEventHookPayload(event, at) {
  const type = safeString(event?.type);

  switch (type) {
    case "todo.updated":
      return normalizeTodoEvent(event, at);
    case "session.status":
      return normalizeSessionStatusEvent(event, at);
    case "session.idle":
      return {
        kind: "session.status",
        sessionId: extractSessionId(event?.properties),
        at,
        attrs: { type: "idle" }
      };
    case "permission.replied":
      return normalizePermissionResolvedEvent(event, at);
    case "session.compacted":
      return normalizeCompactionCompletedEvent(event, at);
    default:
      return null;
  }
}

function resolveRootDir(context) {
  const project = asRecord(context?.project);

  return (
    pickSessionId(context?.worktree, project?.worktree, project?.directory, context?.directory) ?? process.cwd()
  );
}

function toolCallKey(sessionId, callId) {
  return `${sessionId}::${callId}`;
}

function safeDescribeValue(value) {
  try {
    return describeValue(value);
  } catch {
    return "unknown";
  }
}

function safeHashValue(value) {
  try {
    return hashValue(value);
  } catch {
    return null;
  }
}

function toolStatusFromOutput(output) {
  const metadata = asRecord(output?.metadata);
  const explicitStatus = safeString(metadata?.status) ?? safeString(output?.status);

  if (explicitStatus) {
    return explicitStatus;
  }

  const exitCode = metadata?.exitCode;
  if (Number.isFinite(exitCode)) {
    return Number(exitCode) === 0 ? "ok" : "error";
  }

  if (safeString(metadata?.error) || safeString(output?.error)) {
    return "error";
  }

  return "ok";
}

function metadataKeyNames(value, limit = MAX_METADATA_KEYS) {
  const record = asRecord(value);

  if (!record) {
    return [];
  }

  return Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit);
}

function pruneCallStarts(callStarts, now, maxAgeMs) {
  for (const [key, startedAt] of callStarts.entries()) {
    if (!Number.isFinite(startedAt)) {
      callStarts.delete(key);
      continue;
    }

    if (now - startedAt > maxAgeMs) {
      callStarts.delete(key);
    }
  }
}

function createAppLogger(client) {
  return async function log(level, message, extra = null) {
    const logFn = client?.app?.log;

    if (typeof logFn !== "function") {
      return;
    }

    try {
      await logFn({
        body: {
          service: OBSERVER_SERVICE,
          level,
          message,
          extra
        }
      });
    } catch {
      // never break OpenCode because observer logging failed
    }
  };
}

function withHookGuard(log, hookName, run) {
  return async (...args) => {
    try {
      await run(...args);
    } catch (error) {
      await log("error", "observer.hook.failed", {
        hook: hookName,
        error: safeString(error?.message) ?? "unknown"
      });
    }
  };
}

export default async function createAgentObserverPlugin(context) {
  const rootDir = resolveRootDir(context);
  const log = createAppLogger(context?.client);
  const config = await loadObserverConfig(rootDir);

  if (!config.enabled) {
    await log("info", "observer.disabled", { rootDir });
    return {};
  }

  const telemetry = new JsonlTelemetry({
    rootDir,
    logDir: config.logDir
  });

  const detector = new StuckDetector({
    stuckThresholdMs: config.stuckThresholdMs,
    idleThresholdMs: config.idleThresholdMs,
    permissionTimeoutMs: config.permissionTimeoutMs,
    compactionTimeoutMs: config.compactionTimeoutMs,
    repeatToolWindowMs: config.repeatLoopWindowMs,
    repeatToolThreshold: config.repeatLoopThreshold
  });

  const callStarts = new Map();
  const callStartMaxAgeMs = Math.max(
    MIN_CALL_START_MAX_AGE_MS,
    safeInteger(config.stuckThresholdMs, 120000) * 2
  );
  const sisyphusState = await loadSisyphusState(rootDir);

  await log("info", "observer.initialized", {
    rootDir,
    logDir: config.logDir,
    stuckThresholdMs: config.stuckThresholdMs
  });

  async function persistNormalizedEvent(event) {
    if (!event || typeof event.kind !== "string") {
      return;
    }

    const sessionId = safeString(event.sessionId);
    const at = eventTime(event.at);
    const metadata = sessionId ? findSessionMetadata(sisyphusState, sessionId) : {
      planId: null,
      taskId: null,
      sessionOrigin: null
    };

    const telemetryEvent = createTelemetryEvent({
      sessionId,
      planId: event.planId ?? metadata.planId,
      taskId: event.taskId ?? metadata.taskId,
      sessionOrigin: event.sessionOrigin ?? metadata.sessionOrigin,
      surface: event.surface ?? "plugin.agent-observer",
      kind: event.kind,
      status: event.status ?? null,
      attrs: event.attrs ?? {}
    });

    telemetryEvent.ts = timestampIso(at);

    try {
      await telemetry.write(telemetryEvent);
    } catch (error) {
      await log("error", "observer.telemetry.write_failed", {
        eventKind: event.kind,
        error: safeString(error?.message) ?? "unknown"
      });
    }

    if (event.kind === "plan.stuck") {
      await log("warn", "plan.stuck", {
        sessionId,
        reason: event.attrs?.reason ?? null
      });
      return;
    }

    if (event.kind === "plan.resolved") {
      await log("info", "plan.resolved", {
        sessionId,
        reason: event.attrs?.previousReason ?? null
      });
    }
  }

  async function processNormalizedEvent(event, { fromDetector = false } = {}) {
    if (!event || !safeString(event.kind)) {
      return;
    }

    const at = eventTime(event.at);
    const normalized = {
      kind: event.kind,
      sessionId: safeString(event.sessionId),
      at,
      status: safeString(event.status),
      attrs: asRecord(event.attrs) ?? {}
    };

    if (!fromDetector) {
      const tickEvents = detector.tick(at);

      for (const detectorEvent of tickEvents) {
        await processNormalizedEvent(detectorEvent, { fromDetector: true });
      }
    }

    await persistNormalizedEvent(normalized);

    if (fromDetector) {
      return;
    }

    const detectorEvents = detector.record(normalized);

    for (const detectorEvent of detectorEvents) {
      await processNormalizedEvent(detectorEvent, { fromDetector: true });
    }
  }

  const heartbeatMs = safeInteger(config.heartbeatIntervalMs, 0);
  if (heartbeatMs > 0) {
    const interval = setInterval(() => {
      void (async () => {
        const now = Date.now();
        const events = detector.tick(now);

        for (const event of events) {
          await processNormalizedEvent(event, { fromDetector: true });
        }
      })();
    }, heartbeatMs);

    interval.unref?.();
  }

  return {
    event: withHookGuard(log, "event", async ({ event }) => {
      const normalized = normalizeEventHookPayload(event, Date.now());

      if (!normalized) {
        return;
      }

      await processNormalizedEvent(normalized);
    }),
    "tool.execute.before": withHookGuard(log, "tool.execute.before", async (input, output) => {
      const sessionId = pickSessionId(input?.sessionID, input?.sessionId);
      if (!sessionId) {
        return;
      }

      const callId = safeString(input?.callID) ?? "unknown";
      const tool = safeString(input?.tool) ?? "unknown";
      const at = Date.now();

      pruneCallStarts(callStarts, at, callStartMaxAgeMs);
      callStarts.set(toolCallKey(sessionId, callId), at);

      await processNormalizedEvent({
        kind: "tool.started",
        sessionId,
        at,
        attrs: {
          hook: "tool.execute.before",
          tool,
          callId,
          argShape: safeDescribeValue(output?.args),
          argHash: safeHashValue(output?.args)
        }
      });
    }),
    "tool.execute.after": withHookGuard(log, "tool.execute.after", async (input, output) => {
      const sessionId = pickSessionId(input?.sessionID, input?.sessionId);
      if (!sessionId) {
        return;
      }

      const callId = safeString(input?.callID) ?? "unknown";
      const tool = safeString(input?.tool) ?? "unknown";
      const at = Date.now();
      const key = toolCallKey(sessionId, callId);
      const startedAt = callStarts.get(key);

      if (startedAt !== undefined) {
        callStarts.delete(key);
      }

      const outputText = typeof output?.output === "string" ? output.output : "";
      const durationMs = startedAt !== undefined ? Math.max(0, at - startedAt) : null;
      const status = toolStatusFromOutput(output);
      const title = safeString(output?.title);
      const metadataKeys = metadataKeyNames(output?.metadata);

      await processNormalizedEvent({
        kind: "tool.finished",
        sessionId,
        at,
        status,
        attrs: {
          hook: "tool.execute.after",
          tool,
          callId,
          durationMs,
          status,
          title,
          metadataKeys,
          outputLength: outputText.length
        }
      });
    }),
    "permission.ask": withHookGuard(log, "permission.ask", async (input, output) => {
      const sessionId = pickSessionId(input?.sessionID, input?.sessionId);
      if (!sessionId) {
        return;
      }

      const at = eventTime(input?.time?.created);
      const response = safeString(output?.status) ?? "ask";

      await processNormalizedEvent({
        kind: "permission.asked",
        sessionId,
        at,
        attrs: {
          permissionId: safeString(input?.id),
          permissionType: safeString(input?.type),
          response
        }
      });

      if (response !== "ask") {
        await processNormalizedEvent({
          kind: "permission.resolved",
          sessionId,
          at,
          attrs: { response }
        });
      }
    }),
    "experimental.session.compacting": withHookGuard(log, "experimental.session.compacting", async (input) => {
      const sessionId = pickSessionId(input?.sessionID, input?.sessionId);

      if (!sessionId) {
        return;
      }

      await processNormalizedEvent({
        kind: "compaction.start",
        sessionId,
        at: Date.now(),
        attrs: {}
      });
    }),
    "experimental.compaction.autocontinue": withHookGuard(
      log,
      "experimental.compaction.autocontinue",
      async (input, output) => {
        const sessionId = pickSessionId(input?.sessionID, input?.sessionId);

        if (!sessionId) {
          return;
        }

        await processNormalizedEvent({
          kind: "compaction.autocontinue",
          sessionId,
          at: Date.now(),
          attrs: {
            overflow: safeBoolean(input?.overflow),
            enabled: safeBoolean(output?.enabled, true)
          }
        });
      }
    )
  };
}
