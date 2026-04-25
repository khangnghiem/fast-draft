import { createHash } from "node:crypto";

function normalizeNumber(value) {
  if (Number.isNaN(value)) {
    return "NaN";
  }

  if (!Number.isFinite(value)) {
    return String(value);
  }

  if (Object.is(value, -0)) {
    return "-0";
  }

  return value;
}

function stableSerialize(value) {
  if (value === null) {
    return "null";
  }

  const valueType = typeof value;

  if (valueType === "number") {
    return JSON.stringify(normalizeNumber(value));
  }

  if (valueType === "bigint") {
    return JSON.stringify(`${value.toString()}n`);
  }

  if (valueType === "string" || valueType === "boolean") {
    return JSON.stringify(value);
  }

  if (valueType === "undefined") {
    return JSON.stringify("__undefined__");
  }

  if (valueType === "symbol") {
    return JSON.stringify(`symbol:${String(value.description ?? "")}`);
  }

  if (valueType === "function") {
    return JSON.stringify("__function__");
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => stableSerialize(item));
    return `[${items.join(",")}]`;
  }

  if (value instanceof Date) {
    return JSON.stringify({ __date__: value.toISOString() });
  }

  if (value instanceof Map) {
    const entries = Array.from(value.entries()).map(([key, mapValue]) => [
      stableSerialize(key),
      stableSerialize(mapValue)
    ]);
    entries.sort(([left], [right]) => left.localeCompare(right));
    return stableSerialize({ __map__: entries });
  }

  if (value instanceof Set) {
    const entries = Array.from(value.values()).map((entry) => stableSerialize(entry));
    entries.sort((left, right) => left.localeCompare(right));
    return stableSerialize({ __set__: entries });
  }

  if (valueType === "object") {
    const keys = Object.keys(value).sort((left, right) => left.localeCompare(right));
    const parts = keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);
    return `{${parts.join(",")}}`;
  }

  return JSON.stringify(String(value));
}

export function hashValue(value) {
  const serialized = stableSerialize(value);
  return createHash("sha256").update(serialized).digest("hex").slice(0, 16);
}

function describeObject(value) {
  const shape = {};

  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    shape[key] = describeValue(value[key]);
  }

  return shape;
}

export function describeValue(value) {
  if (value === null) {
    return "null";
  }

  const valueType = typeof value;

  if (valueType === "string") {
    return `string(${value.length})`;
  }

  if (valueType === "number") {
    return "number";
  }

  if (valueType === "boolean") {
    return "boolean";
  }

  if (valueType === "bigint") {
    return "bigint";
  }

  if (valueType === "undefined") {
    return "undefined";
  }

  if (valueType === "symbol") {
    return "symbol";
  }

  if (valueType === "function") {
    return "function";
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      items: value.length > 0 ? describeValue(value[0]) : "empty"
    };
  }

  if (value instanceof Date) {
    return "date";
  }

  if (value instanceof Map) {
    return {
      type: "map",
      size: value.size
    };
  }

  if (value instanceof Set) {
    return {
      type: "set",
      size: value.size
    };
  }

  if (valueType === "object") {
    return describeObject(value);
  }

  return "unknown";
}
