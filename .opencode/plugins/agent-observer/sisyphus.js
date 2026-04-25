import { readFile } from "node:fs/promises";
import path from "node:path";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function pickPlanId(activePlanPath) {
  const raw = safeString(activePlanPath);

  if (!raw) {
    return null;
  }

  const parsed = path.parse(raw);
  return parsed.name || null;
}

function planIdFromState(state) {
  if (!isRecord(state)) {
    return null;
  }

  const fromName = safeString(state.plan_name);
  if (fromName) {
    return fromName;
  }

  return pickPlanId(state.active_plan);
}

function sessionOriginFromState(state, sessionId) {
  if (!isRecord(state)) {
    return null;
  }

  const origins = state.session_origins;
  if (!isRecord(origins)) {
    return null;
  }

  return safeString(origins[sessionId]);
}

function sessionTaskId(task) {
  if (!isRecord(task)) {
    return null;
  }

  const explicitTaskId = safeString(task.task_id);
  if (explicitTaskId) {
    return explicitTaskId;
  }

  const taskKey = safeString(task.task_key);
  if (taskKey) {
    return taskKey;
  }

  return safeString(task.task_label);
}

function taskIdFromTaskSessions(state, sessionId) {
  if (!isRecord(state)) {
    return null;
  }

  const taskSessions = state.task_sessions;
  if (!isRecord(taskSessions)) {
    return null;
  }

  for (const task of Object.values(taskSessions)) {
    if (!isRecord(task)) {
      continue;
    }

    if (task.session_id !== sessionId) {
      continue;
    }

    const taskId = sessionTaskId(task);
    if (taskId) {
      return taskId;
    }
  }

  return null;
}

export async function loadSisyphusState(rootDir) {
  const filePath = path.join(rootDir, ".sisyphus", "boulder.json");

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function findSessionMetadata(state, sessionId) {
  if (!isRecord(state) || typeof sessionId !== "string" || sessionId.length === 0) {
    return {
      planId: null,
      taskId: null,
      sessionOrigin: null
    };
  }

  return {
    planId: planIdFromState(state),
    taskId: taskIdFromTaskSessions(state, sessionId),
    sessionOrigin: sessionOriginFromState(state, sessionId)
  };
}
