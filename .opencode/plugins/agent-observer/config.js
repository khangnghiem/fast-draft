import { readFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_CONFIG = {
  enabled: true,
  logDir: ".opencode/telemetry",
  heartbeatIntervalMs: 30000,
  stuckThresholdMs: 120000,
  idleThresholdMs: 15000,
  permissionTimeoutMs: 60000,
  compactionTimeoutMs: 30000,
  repeatLoopWindowMs: 60000,
  repeatLoopThreshold: 3
};

const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidConfig(config) {
  if (!isObjectRecord(config)) {
    return false;
  }

  for (const key of CONFIG_KEYS) {
    if (!(key in config)) {
      continue;
    }

    if (typeof config[key] !== typeof DEFAULT_CONFIG[key]) {
      return false;
    }
  }

  return true;
}

function pickKnownConfigValues(config) {
  const partial = {};

  for (const key of CONFIG_KEYS) {
    if (key in config) {
      partial[key] = config[key];
    }
  }

  return partial;
}

export async function loadObserverConfig(rootDir) {
  const filePath = path.join(rootDir, ".opencode", "observer.config.json");

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);

    if (!isValidConfig(parsed)) {
      return { ...DEFAULT_CONFIG };
    }

    return {
      ...DEFAULT_CONFIG,
      ...pickKnownConfigValues(parsed)
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
