/**
 * Pointer Event Normalization & Routing
 *
 * Shared pointer handling logic for all FD canvas platforms.
 * Normalizes pointer events to scene-space coordinates and
 * classifies gestures (pan, pinch, draw, select).
 */

// ── Types ────────────────────────────────────────────────────────────

/** Scene-space coordinates (after viewport transform). */
export interface ScenePoint {
  x: number;
  y: number;
}

/** Tracked pointer state for gesture recognition. */
export interface PointerState {
  /** Active pointer IDs and their last known positions. */
  pointers: Map<number, ScenePoint>;
  /** Whether a drag gesture is in progress. */
  isDragging: boolean;
  /** Starting position of the current drag. */
  dragStart: ScenePoint | null;
  /** Timestamp when the first pointer went down. */
  downTimestamp: number;
}

/** Recognized gesture type. */
export type GestureKind =
  | "tap"
  | "drag"
  | "pan"
  | "pinch"
  | "long-press";

/** Viewport transform: offset + scale. */
export interface ViewportTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

// ── Functions ────────────────────────────────────────────────────────

/** Create a fresh pointer state. */
export function createPointerState(): PointerState {
  return {
    pointers: new Map(),
    isDragging: false,
    dragStart: null,
    downTimestamp: 0,
  };
}

/** Convert a viewport-space point to scene-space using the current transform. */
export function viewportToScene(
  clientX: number,
  clientY: number,
  canvas: { offsetLeft: number; offsetTop: number },
  transform: ViewportTransform
): ScenePoint {
  const canvasX = clientX - canvas.offsetLeft;
  const canvasY = clientY - canvas.offsetTop;
  return {
    x: (canvasX - transform.offsetX) / transform.scale,
    y: (canvasY - transform.offsetY) / transform.scale,
  };
}

/** Classify the current gesture from pointer state. */
export function classifyGesture(
  state: PointerState,
  now: number
): GestureKind {
  const pointerCount = state.pointers.size;

  if (pointerCount >= 2) {
    return "pinch";
  }

  if (state.isDragging) {
    return "drag";
  }

  const elapsed = now - state.downTimestamp;
  if (elapsed > 500 && pointerCount === 1) {
    return "long-press";
  }

  return "tap";
}

/**
 * Calculate pinch distance between two pointers.
 * Returns 0 if fewer than 2 pointers are tracked.
 */
export function pinchDistance(state: PointerState): number {
  const entries = Array.from(state.pointers.values());
  if (entries.length < 2) return 0;
  const [a, b] = entries;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate pinch midpoint between two pointers.
 * Returns null if fewer than 2 pointers are tracked.
 */
export function pinchMidpoint(state: PointerState): ScenePoint | null {
  const entries = Array.from(state.pointers.values());
  if (entries.length < 2) return null;
  const [a, b] = entries;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}
