import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TELEMETRY_DIR = path.join(".opencode", "telemetry");
const DURATION_UNITS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
};

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseTimestamp(value) {
  const parsed = Date.parse(safeString(value) ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDuration(value) {
  const raw = safeString(value)?.trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d+)\s*(ms|s|m|h|d)$/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  return amount * DURATION_UNITS[unit];
}

function initialSessionState(sessionId) {
  return {
    sessionId,
    resolved: true,
    reason: null,
    startedAt: null,
    resolvedAt: null,
    lastEventAt: null
  };
}

function applyStuckEvent(state, event) {
  const eventTs = safeString(event.ts);
  const attrs = isRecord(event.attrs) ? event.attrs : null;

  state.resolved = false;
  state.reason = safeString(attrs?.reason) ?? state.reason;
  state.startedAt = eventTs ?? state.startedAt;
  state.resolvedAt = null;
  state.lastEventAt = eventTs ?? state.lastEventAt;
}

function applyResolvedEvent(state, event) {
  const eventTs = safeString(event.ts);
  const attrs = isRecord(event.attrs) ? event.attrs : null;

  state.resolved = true;
  state.reason = safeString(attrs?.previousReason) ?? state.reason;
  state.resolvedAt = eventTs ?? state.resolvedAt;
  state.lastEventAt = eventTs ?? state.lastEventAt;
}

export function summarizeStuckSessions(events) {
  const sessions = new Map();

  for (const event of events) {
    if (!isRecord(event)) {
      continue;
    }

    const sessionId = safeString(event.sessionId);
    if (!sessionId) {
      continue;
    }

    if (event.kind !== "plan.stuck" && event.kind !== "plan.resolved") {
      continue;
    }

    const state = sessions.get(sessionId) ?? initialSessionState(sessionId);

    if (event.kind === "plan.stuck") {
      applyStuckEvent(state, event);
    } else {
      applyResolvedEvent(state, event);
    }

    sessions.set(sessionId, state);
  }

  return [...sessions.values()].sort((left, right) => left.sessionId.localeCompare(right.sessionId));
}

function parseCliArgs(argv) {
  const args = {
    sessionId: null,
    sinceMs: null,
    stuckOnly: false,
    format: "table",
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    if (token === "--stuck-only") {
      args.stuckOnly = true;
      continue;
    }

    if (token === "--session" || token.startsWith("--session=")) {
      const value = token.includes("=") ? token.split("=").slice(1).join("=") : argv[++index];
      const sessionId = safeString(value);

      if (!sessionId) {
        throw new Error("--session requires a non-empty value");
      }

      args.sessionId = sessionId;
      continue;
    }

    if (token === "--since" || token.startsWith("--since=")) {
      const value = token.includes("=") ? token.split("=").slice(1).join("=") : argv[++index];
      const sinceMs = parseDuration(value);

      if (sinceMs === null) {
        throw new Error("--since expects a duration like 15m, 1h, or 30s");
      }

      args.sinceMs = sinceMs;
      continue;
    }

    if (token === "--format" || token.startsWith("--format=")) {
      const value = token.includes("=") ? token.split("=").slice(1).join("=") : argv[++index];
      const format = safeString(value)?.toLowerCase();

      if (format !== "table" && format !== "json") {
        throw new Error("--format must be table or json");
      }

      args.format = format;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function usageText() {
  return [
    "Usage: observer-dump [options]",
    "",
    "Options:",
    "  --session <id>        Filter by session id",
    "  --since <duration>    Filter events newer than duration (e.g. 15m, 1h)",
    "  --stuck-only          Show unresolved stuck sessions only",
    "  --format <table|json> Output format",
    "  --help                Show this help"
  ].join("\n");
}

function createWriter(target, fallbackStream) {
  if (typeof target === "function") {
    return target;
  }

  const stream = target && typeof target.write === "function" ? target : fallbackStream;
  return (text) => stream.write(`${text}\n`);
}

function resolveNowMs(nowProvider) {
  if (typeof nowProvider !== "function") {
    return Date.now();
  }

  const current = nowProvider();
  return Number.isFinite(current) ? Number(current) : Date.now();
}

function clipCell(value, maxLength = 40) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function formatTable(summary, { stuckOnly }) {
  if (summary.length === 0) {
    return stuckOnly ? "No unresolved stuck sessions." : "No plan.stuck / plan.resolved events found.";
  }

  const headers = ["sessionId", "state", "reason", "startedAt", "resolvedAt", "lastEventAt"];
  const rows = summary.map((item) => [
    item.sessionId,
    item.resolved ? "resolved" : "stuck",
    clipCell(item.reason ?? "-"),
    item.startedAt ?? "-",
    item.resolvedAt ?? "-",
    item.lastEventAt ?? "-"
  ]);

  const widths = headers.map((header, columnIndex) => {
    const longestCell = rows.reduce((max, row) => Math.max(max, row[columnIndex].length), 0);
    return Math.max(header.length, longestCell);
  });

  const headerLine = headers.map((header, index) => header.padEnd(widths[index])).join("  ");
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  const bodyLines = rows.map((row) => row.map((cell, index) => cell.padEnd(widths[index])).join("  "));

  return [headerLine, separator, ...bodyLines].join("\n");
}

function sortEventsByTs(events) {
  return events
    .map((event, index) => ({ event, index, ts: parseTimestamp(event.ts) }))
    .sort((left, right) => {
      if (left.ts !== null && right.ts !== null && left.ts !== right.ts) {
        return left.ts - right.ts;
      }

      if (left.ts !== null && right.ts === null) {
        return -1;
      }

      if (left.ts === null && right.ts !== null) {
        return 1;
      }

      return left.index - right.index;
    })
    .map(({ event }) => event);
}

async function readTelemetryEvents(logDir) {
  let entries;

  try {
    entries = await readdir(logDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { events: [], malformedLineCount: 0 };
    }

    throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile() && /^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry.name))
    .map((entry) => path.join(logDir, entry.name))
    .sort((left, right) => left.localeCompare(right));

  const events = [];
  let malformedLineCount = 0;

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }

      try {
        const event = JSON.parse(line);
        if (isRecord(event)) {
          events.push(event);
        } else {
          malformedLineCount += 1;
        }
      } catch {
        malformedLineCount += 1;
      }
    }
  }

  return {
    events,
    malformedLineCount
  };
}

function filterPlanEvents(events, { sessionId, sinceMs, nowMs }) {
  const cutoff = sinceMs === null ? null : nowMs - sinceMs;

  return sortEventsByTs(events).filter((event) => {
    if (event.kind !== "plan.stuck" && event.kind !== "plan.resolved") {
      return false;
    }

    const eventSessionId = safeString(event.sessionId);
    if (!eventSessionId) {
      return false;
    }

    if (sessionId && eventSessionId !== sessionId) {
      return false;
    }

    if (cutoff === null) {
      return true;
    }

    const ts = parseTimestamp(event.ts);
    return ts !== null && ts >= cutoff;
  });
}

export async function runObserverDumpCli(argv, options = {}) {
  const out = createWriter(options.stdout, process.stdout);
  const err = createWriter(options.stderr, process.stderr);

  let args;

  try {
    args = parseCliArgs(argv);
  } catch (error) {
    err(`Error: ${error.message}`);
    err(usageText());
    return 2;
  }

  if (args.help) {
    out(usageText());
    return 0;
  }

  const cwd = safeString(options.cwd) ?? process.cwd();
  const nowMs = resolveNowMs(options.now);
  const telemetryDir = safeString(options.telemetryDir) ?? path.join(cwd, DEFAULT_TELEMETRY_DIR);

  let loaded;

  try {
    loaded = await readTelemetryEvents(telemetryDir);
  } catch (error) {
    err(`Error: failed to read telemetry from ${telemetryDir}`);
    err(error?.message ?? "Unknown filesystem error");
    return 2;
  }

  if (loaded.malformedLineCount > 0) {
    err(`Ignored ${loaded.malformedLineCount} malformed telemetry line(s).`);
  }

  const filteredEvents = filterPlanEvents(loaded.events, {
    sessionId: args.sessionId,
    sinceMs: args.sinceMs,
    nowMs
  });

  const summary = summarizeStuckSessions(filteredEvents);
  const outputSummary = args.stuckOnly ? summary.filter((item) => !item.resolved) : summary;

  if (args.format === "json") {
    out(JSON.stringify(outputSummary, null, 2));
  } else {
    out(formatTable(outputSummary, { stuckOnly: args.stuckOnly }));
  }

  if (args.stuckOnly && outputSummary.length > 0) {
    return 1;
  }

  return 0;
}
