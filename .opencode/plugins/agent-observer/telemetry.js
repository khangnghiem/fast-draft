import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

function resolveLogDir(rootDir, logDir) {
  if (path.isAbsolute(logDir)) {
    return logDir;
  }

  return path.join(rootDir, logDir);
}

function eventDate(ts) {
  return ts.slice(0, 10);
}

function isMissingPathError(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
}

export function createTelemetryEvent(input) {
  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    ts: new Date().toISOString(),
    sessionId: input.sessionId ?? null,
    planId: input.planId ?? null,
    taskId: input.taskId ?? null,
    sessionOrigin: input.sessionOrigin ?? null,
    surface: input.surface ?? "unknown",
    kind: input.kind,
    status: input.status ?? null,
    attrs: input.attrs ?? {}
  };
}

export class JsonlTelemetry {
  #writeQueue = Promise.resolve();
  #ensureDirPromise = null;

  constructor({ rootDir, logDir }) {
    this.rootDir = rootDir;
    this.logDir = resolveLogDir(rootDir, logDir);
  }

  async #ensureDir() {
    if (!this.#ensureDirPromise) {
      this.#ensureDirPromise = mkdir(this.logDir, { recursive: true }).catch((error) => {
        this.#ensureDirPromise = null;
        throw error;
      });
    }

    return this.#ensureDirPromise;
  }

  async #appendWithRecovery(filePath, line) {
    try {
      await appendFile(filePath, line, "utf8");
      return;
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }

    this.#ensureDirPromise = null;
    await this.#ensureDir();
    await appendFile(filePath, line, "utf8");
  }

  write(event) {
    const runWrite = async () => {
      await this.#ensureDir();
      const fileName = `events-${eventDate(event.ts)}.jsonl`;
      const filePath = path.join(this.logDir, fileName);
      const line = `${JSON.stringify(event)}\n`;
      await this.#appendWithRecovery(filePath, line);
    };

    const writePromise = this.#writeQueue.then(runWrite, runWrite);
    this.#writeQueue = writePromise.catch(() => {});

    return writePromise;
  }
}
