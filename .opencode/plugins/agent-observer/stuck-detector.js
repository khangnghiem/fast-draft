function safeNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function safePositiveNumber(value, fallback) {
  const parsed = safeNumber(value, fallback);
  return parsed >= 0 ? parsed : fallback;
}

function safePositiveInteger(value, fallback) {
  const parsed = Math.trunc(safeNumber(value, fallback));
  return parsed > 0 ? parsed : fallback;
}

function safeString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toTimestamp(value, fallback) {
  return safePositiveNumber(value, fallback);
}

function toolSignature(tool, argHash) {
  return `${tool}:${argHash}`;
}

const DEFAULTS = {
  stuckThresholdMs: 120000,
  idleThresholdMs: 15000,
  permissionTimeoutMs: 60000,
  compactionTimeoutMs: 30000,
  repeatToolWindowMs: 60000,
  repeatToolThreshold: 3
};

export class StuckDetector {
  constructor(config = {}) {
    this.now = typeof config.now === "function" ? config.now : () => Date.now();
    this.config = {
      stuckThresholdMs: safePositiveNumber(config.stuckThresholdMs, DEFAULTS.stuckThresholdMs),
      idleThresholdMs: safePositiveNumber(config.idleThresholdMs, DEFAULTS.idleThresholdMs),
      permissionTimeoutMs: safePositiveNumber(config.permissionTimeoutMs, DEFAULTS.permissionTimeoutMs),
      compactionTimeoutMs: safePositiveNumber(config.compactionTimeoutMs, DEFAULTS.compactionTimeoutMs),
      repeatToolWindowMs: safePositiveNumber(
        config.repeatToolWindowMs ?? config.repeatLoopWindowMs,
        DEFAULTS.repeatToolWindowMs
      ),
      repeatToolThreshold: safePositiveInteger(
        config.repeatToolThreshold ?? config.repeatLoopThreshold,
        DEFAULTS.repeatToolThreshold
      )
    };
    this.sessions = new Map();
  }

  record(event) {
    const sessionId = safeString(event?.sessionId);
    if (!sessionId) {
      return [];
    }

    const at = toTimestamp(event?.at, this.now());
    const state = this.#session(sessionId, at);
    state.lastEventAt = at;

    this.#applyEvent(state, event, at);

    if (!this.#isProgressEvent(event)) {
      return this.#evaluate(state, at);
    }

    return this.#onProgress(state, event, at);
  }

  tick(now = this.now()) {
    const at = toTimestamp(now, this.now());
    const events = [];

    for (const state of this.sessions.values()) {
      events.push(...this.#evaluate(state, at));
    }

    return events;
  }

  #session(sessionId, at) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        sessionId,
        lastProgressAt: at,
        lastEventAt: at,
        lastStatus: null,
        hasPendingTodos: false,
        pendingPermission: null,
        afterCompactionAt: null,
        recentTools: [],
        lastTool: null,
        stuck: null
      });
    }

    return this.sessions.get(sessionId);
  }

  #applyEvent(state, event, at) {
    const attrs = event?.attrs ?? {};

    switch (event?.kind) {
      case "session.status": {
        state.lastStatus = safeString(attrs.type) ?? state.lastStatus;
        break;
      }
      case "todo.updated": {
        if (typeof attrs.hasPendingTodos === "boolean") {
          state.hasPendingTodos = attrs.hasPendingTodos;
        }
        break;
      }
      case "permission.asked": {
        state.pendingPermission = { askedAt: at };
        break;
      }
      case "permission.resolved": {
        state.pendingPermission = null;
        break;
      }
      case "compaction.start":
      case "compaction.autocontinue":
      case "compaction.completed": {
        state.afterCompactionAt = at;
        break;
      }
      case "tool.started": {
        this.#recordToolStart(state, attrs, at);
        break;
      }
      case "tool.finished": {
        const tool = safeString(attrs.tool);
        if (tool) {
          state.lastTool = tool;
        }
        break;
      }
      default:
        break;
    }
  }

  #recordToolStart(state, attrs, at) {
    const tool = safeString(attrs.tool) ?? "unknown";
    const argHash = safeString(attrs.argHash);
    state.lastTool = tool;

    if (!argHash) {
      return;
    }

    state.recentTools.push({
      tool,
      argHash,
      signature: toolSignature(tool, argHash),
      at
    });

    this.#pruneRecentTools(state, at);
  }

  #pruneRecentTools(state, now) {
    const windowStart = now - this.config.repeatToolWindowMs;
    state.recentTools = state.recentTools.filter((entry) => entry.at >= windowStart);
  }

  #isProgressEvent(event) {
    if (event?.kind === "tool.finished" || event?.kind === "permission.resolved") {
      return true;
    }

    return event?.kind === "todo.updated" && event?.attrs?.hasPendingTodos === false;
  }

  #onProgress(state, event, at) {
    state.lastProgressAt = at;
    state.afterCompactionAt = null;

    if (!state.stuck) {
      return [];
    }

    const resolvedEvent = this.#buildResolvedEvent(state, event, at);
    state.stuck = null;
    return [resolvedEvent];
  }

  #evaluate(state, now) {
    if (state.stuck) {
      return [];
    }

    const diagnosis =
      this.#diagnoseWaitingPermission(state, now) ??
      this.#diagnoseRepeatToolLoop(state, now) ??
      this.#diagnosePostCompaction(state, now) ??
      this.#diagnoseIdlePendingTodos(state, now) ??
      this.#diagnoseBusyNoProgress(state, now);

    if (!diagnosis) {
      return [];
    }

    state.stuck = {
      reason: diagnosis.reason,
      startedAt: now
    };

    return [this.#buildStuckEvent(state, diagnosis, now)];
  }

  #diagnoseWaitingPermission(state, now) {
    if (!state.pendingPermission) {
      return null;
    }

    const ageMs = now - state.pendingPermission.askedAt;
    if (ageMs < this.config.permissionTimeoutMs) {
      return null;
    }

    return {
      reason: "waiting_permission",
      pendingPermissionAgeMs: ageMs
    };
  }

  #diagnoseRepeatToolLoop(state, now) {
    this.#pruneRecentTools(state, now);

    if (state.recentTools.length === 0) {
      return null;
    }

    const counts = new Map();
    let match = null;

    for (const entry of state.recentTools) {
      const current = (counts.get(entry.signature) ?? 0) + 1;
      counts.set(entry.signature, current);

      if (current < this.config.repeatToolThreshold) {
        continue;
      }

      if (!match || current > match.count || entry.at > match.lastAt) {
        match = {
          tool: entry.tool,
          argHash: entry.argHash,
          count: current,
          lastAt: entry.at
        };
      }
    }

    if (!match) {
      return null;
    }

    return {
      reason: "repeat_tool_loop",
      loop: {
        tool: match.tool,
        argHash: match.argHash,
        count: match.count,
        windowMs: this.config.repeatToolWindowMs
      }
    };
  }

  #diagnosePostCompaction(state, now) {
    if (state.afterCompactionAt === null) {
      return null;
    }

    const ageMs = now - state.afterCompactionAt;
    if (ageMs < this.config.compactionTimeoutMs) {
      return null;
    }

    return {
      reason: "post_compaction_no_progress",
      compactionAgeMs: ageMs
    };
  }

  #diagnoseIdlePendingTodos(state, now) {
    if (!state.hasPendingTodos || state.lastStatus !== "idle") {
      return null;
    }

    const inactivityMs = now - state.lastProgressAt;
    if (inactivityMs < this.config.idleThresholdMs) {
      return null;
    }

    return {
      reason: "idle_with_pending_todos",
      inactivityMs
    };
  }

  #diagnoseBusyNoProgress(state, now) {
    const busyByStatus = state.lastStatus === "busy";
    const busyByTodos = state.hasPendingTodos;

    if (!busyByStatus && !busyByTodos) {
      return null;
    }

    const inactivityMs = now - state.lastProgressAt;
    if (inactivityMs < this.config.stuckThresholdMs) {
      return null;
    }

    return {
      reason: "busy_no_progress",
      inactivityMs
    };
  }

  #buildStuckEvent(state, diagnosis, now) {
    return {
      kind: "plan.stuck",
      sessionId: state.sessionId,
      at: now,
      attrs: {
        reason: diagnosis.reason,
        lastStatus: state.lastStatus,
        lastTool: state.lastTool,
        recentTools: this.#recentToolsSummary(state, now),
        pendingPermissionAgeMs: diagnosis.pendingPermissionAgeMs ?? null,
        inactivityMs: diagnosis.inactivityMs ?? null,
        compactionAgeMs: diagnosis.compactionAgeMs ?? null,
        repeatToolLoop: diagnosis.loop ?? null
      }
    };
  }

  #buildResolvedEvent(state, event, at) {
    return {
      kind: "plan.resolved",
      sessionId: state.sessionId,
      at,
      attrs: {
        previousReason: state.stuck?.reason ?? null,
        progressKind: event.kind,
        lastStatus: state.lastStatus,
        lastTool: state.lastTool
      }
    };
  }

  #recentToolsSummary(state, now) {
    this.#pruneRecentTools(state, now);

    if (state.recentTools.length === 0) {
      return [];
    }

    const grouped = new Map();

    for (const entry of state.recentTools) {
      const existing = grouped.get(entry.signature);
      if (!existing) {
        grouped.set(entry.signature, {
          tool: entry.tool,
          argHash: entry.argHash,
          count: 1,
          lastAt: entry.at
        });
        continue;
      }

      existing.count += 1;
      existing.lastAt = Math.max(existing.lastAt, entry.at);
    }

    return [...grouped.values()]
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }

        return right.lastAt - left.lastAt;
      })
      .slice(0, 5)
      .map((entry) => ({
        tool: entry.tool,
        argHash: entry.argHash,
        count: entry.count,
        lastSeenMsAgo: Math.max(0, now - entry.lastAt)
      }));
  }
}
