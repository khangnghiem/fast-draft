# T1: Coordinate Path Audit — Positioning Truth Table

## Audit Date: 2026-04-18

## Source Files
- `site/canvas-core/inline-edit.js:141-294` (openInlineEditor)
- `crates/fd-wasm/src/render2d.rs:598-622` (draw_text)
- `site/app.js:391` (setTransform)

## Coordinate Systems

| System | Transform | Units |
|--------|-----------|-------|
| Scene space | Identity | FD units (px at zoom=1) |
| Canvas2D | `ctx.setTransform(dpr*z, 0, 0, dpr*z, panX*dpr, panY*dpr)` | Physical px |
| CSS overlay | `style.left/top` in CSS px | CSS px |
| Screen | `getBoundingClientRect()` | CSS px from viewport |

## Key Conversions

- **Scene→Screen (CSS)**: `screenX = sceneX * zoomLevel + panX + canvasOffsetX`
- **Screen→Scene**: `sceneX = ((clientX - rect.left) - panX) / zoomLevel`
- **canvasOffsetX/Y** = `canvasRect.left - containerRect.left` (CSS px offset of canvas within container)

## Bounds Source

- `fdCanvas.get_node_bounds(id)` → `{x, y, w, h}` in **scene space**
- For text-in-shape, reads **parent shape** bounds (posId = parentShapeId)
- For canvas-create, reads createCtx.x/y
- Default fallback: `{x:0, y:0, w:80, h:24}`

## Positioning Formula (inline-edit.js:228-233)

```js
centerX = (isTextNode && !isInShape) ? 0 : (sw - scaledW) / 2
centerY = (isTextNode && !isInShape) ? 0 : (sh - scaledH) / 2
sx = (b.x || 0) * zoomLevel + panX + canvasOffsetX - centerX
sy = (b.y || 0) * zoomLevel + panY + canvasOffsetY - centerY
```

Where:
- `sw = max(scaledW, 80) + 2` (minimum width 80px + 2px border)
- `sh = max(scaledH, lineHeight + 4)`
- `scaledW = bw * zoomLevel`, `scaledH = bh * zoomLevel`
- `b.x || 0` — **BUG: falsy for x=0, returns 0 correctly but confusing**

## Truth Table: All 18 Combinations

| # | Node Type | x:/y: Props | In Shape | VAlign | Single/Multi | centerX | centerY | Expected sx | Expected sy | Bug? |
|---|-----------|-------------|----------|--------|--------------|---------|---------|-------------|-------------|------|
| 1 | standalone text | no | no | top | single | 0 | 0 | b.x*z+panX+offX | b.y*z+panY+offY | No (0,0 is default) |
| 2 | standalone text | no | no | middle | single | 0 | 0 | b.x*z+panX+offX | b.y*z+panY+offY | **YES** — textarea at top of bounds, canvas draws at center (b.y+b.h/2 with baseline="middle") |
| 3 | standalone text | no | no | bottom | single | 0 | 0 | b.x*z+panX+offX | b.y*z+panY+offY | **YES** — same as middle |
| 4 | standalone text | yes (x:200,y:150) | no | top | single | 0 | 0 | 200*z+panX+offX | 150*z+panY+offY | No if bounds are fresh |
| 5 | standalone text | yes | no | middle | single | 0 | 0 | same as #2 | same as #2 | **YES** |
| 6 | standalone text | yes | no | bottom | single | 0 | 0 | same as #3 | same as #3 | **YES** |
| 7 | text-in-rect | — | yes | top | single | (sw-scaledW)/2 | (sh-scaledH)/2 | b.x*z+panX+offX-center | b.y*z+panY+offY-center | Partial — centering offset may be wrong for min-width clamp |
| 8 | text-in-rect | — | yes | middle | single | (sw-scaledW)/2 | (sh-scaledH)/2 | b.x*z+panX+offX-center | b.y*z+panY+offY-center | Partial — vertical center correct if bounds match shape |
| 9 | text-in-rect | — | yes | bottom | single | (sw-scaledW)/2 | (sh-scaledH)/2 | b.x*z+panX+offX-center | b.y*z+panY+offY-center | Partial |
| 10 | text-in-ellipse | — | yes | top | single | (sw-scaledW)/2 | (sh-scaledH)/2 | b.x*z+panX+offX-center | b.y*z+panY+offY-center | Same as #7 |
| 11 | text-in-ellipse | — | yes | middle | single | (sw-scaledW)/2 | (sh-scaledH)/2 | b.x*z+panX+offX-center | b.y*z+panY+offY-center | Same as #8 |
| 12 | text-in-ellipse | — | yes | bottom | single | (sw-scaledW)/2 | (sh-scaledH)/2 | b.x*z+panX+offX-center | b.y*z+panY+offY-center | Same as #9 |
| 13 | standalone text | no | no | top | multi | 0 | 0 | b.x*z+panX+offX | b.y*z+panY+offY | No (top-aligned matches) |
| 14 | standalone text | no | no | middle | multi | 0 | 0 | b.x*z+panX+offX | b.y*z+panY+offY | **YES** — canvas draws b.y+(b.h-total_h)/2 with baseline=top, but overlay is at b.y |
| 15 | standalone text | no | no | bottom | multi | 0 | 0 | b.x*z+panX+offX | b.y*z+panY+offY | **YES** — offset from bottom |
| 16 | text-in-rect | — | yes | top | multi | (sw-scaledW)/2 | (sh-scaledH)/2 | b.x*z+panX+offX-center | b.y*z+panY+offY-center | Same as #7 |
| 17 | text-in-rect | — | yes | middle | multi | (sw-scaledW)/2 | (sh-scaledH)/2 | b.x*z+panX+offX-center | b.y*z+panY+offY-center | Same as #8 |
| 18 | text-in-rect | — | yes | bottom | multi | (sw-scaledW)/2 | (sh-scaledH)/2 | b.x*z+panX+offX-center | b.y*z+panY+offY-center | Same as #9 |

## Bug Summary

### BUG 1 (Critical): Standalone text valign=middle/bottom doesn't offset textarea vertically

**Rows**: 2, 3, 5, 6, 14, 15

The textarea overlay always starts at `b.y * zoomLevel + panY + canvasOffsetY` (top of bounds).

But the Canvas2D renderer positions text differently per vertical alignment:
- **Top**: `y = b.y + 2.0`, baseline="top" → textarea top ~matches
- **Middle (single)**: `y = b.y + b.height/2`, baseline="middle" → text is centered, overlay is at top
- **Middle (multi)**: `y = b.y + (b.height - total_text_height) / 2`, baseline="top" → text is centered, overlay is at top
- **Bottom**: `y = b.y + b.height - 2.0`, baseline="bottom" → text is at bottom, overlay is at top

**Fix**: Add vertical offset to `sy` based on valign. Standalone text needs the same offset that the padTop/padBottom calculation provides to the textarea internal padding — BUT `sx`/`sy` position the textarea's top-left corner, so we need to shift the POSITION too.

Wait — the padTop/padBottom (lines 276-290) IS calculated and applied to the textarea's internal padding. The textarea text starts at `padTop` from the textarea top. So the vertical positioning IS handled by internal padding, not by sy offset. **But this only works if the textarea height (sh) matches the bounds height (scaledH).** When `sh > scaledH` (minimum height clamp), the extra padding shifts text down within the textarea, which visually mimics centering.

**Conclusion**: This actually partially works via padTop/padBottom, but ONLY if the textarea dimensions (sh) are correct. The issue is that `sh = max(scaledH, lineHeight + 4)` — for a single line, `sh` is likely `lineHeight + 4`, which may be less than `scaledH` for a tall bounds. If scaledH > lineHeight+4, sh = scaledH → correct. If scaledH < lineHeight+4, sh = lineHeight+4 → centering within a taller textarea is wrong because the textarea height doesn't match the rendered bounds height.

### BUG 2: `b.x || 0` masks position=0

**Rows**: All standalone text with x:0 or y:0

`b.x || 0` will return 0 for both `undefined` and `0`. This is technically correct (0 position should produce 0 offset), but it means we can't distinguish "no position set" from "position set to 0". In practice this is not a real bug since 0 and undefined should both map to scene origin.

### BUG 3: centerX/centerY for text-in-shape when sw > scaledW

**Rows**: 7-12, 16-18

When the min-width clamp applies (`sw = max(scaledW, 80) + 2`), `sw > scaledW`, and `centerX = (sw - scaledW) / 2`. This shifts the textarea left to center it. However, the textarea's CSS width is set to `sw`, while the canvas renders text within the bounds of width `scaledW`. The centering assumes the textarea should be centered over the shape, which is correct. BUT when the shape is narrow and text min-width exceeds the shape width, the textarea extends beyond the shape bounds on both sides — this is by design.

**No actual bug here**, the min-width centering is correct.

### BUG 4: Bounds freshness (critical)

`get_node_bounds()` reads `current_bounds()` which returns the last layout-resolved bounds. If `measureAndUpdateTextBounds()` is called (line 158) before reading bounds (line 169), the width/height should be updated. BUT `measureAndUpdateTextBounds()` only updates **w/h**, not **x/y**. If the node was just dragged or mutated via x:/y: properties, the x/y in bounds may not be updated until a full `finalize_bounds()` is called.

**Fix needed**: Call `fdCanvas.finalize_bounds()` before reading bounds to ensure x/y are fresh.

### BUG 5: `canvasOffsetX/Y` staleness

`canvasOffsetX/Y` is calculated once at the start of `openInlineEditor` (lines 213-216). If the layout changed between last render and this call (e.g., side panel opened/closed), the offset may be stale.

**Fix**: Read `canvasOffsetX/Y` at the time of measurement, right before positioning. Already done correctly since the function reads it at line 213-216 which is before use at 232-233.

### BUG 6: Multi-line vs single-line vertical alignment mismatch in Rust

Fixed in T2 — `_start_y` dead code removed. But the **dual strategy** remains:
- Single-line Middle: `b.y + b.height/2` with baseline="middle"
- Multi-line Middle: `b.y + (b.height - total_text_height)/2` with baseline="top"

These produce DIFFERENT visual results for the same valign=middle when bounds height ≠ text height. The inline editor padTop calculation (line 281-284) matches the **multi-line** strategy (centers text block within textarea). For single-line middle with a tall bounds, the canvas draws text at the center of bounds using baseline="middle", but the textarea padTop would center the single line at the center of the textarea. If sh=scaledH, these should match.

**Remaining concern**: For a single-line text with valign=middle in a very tall bounds, baseline="middle" places the text exactly at the vertical center. The overlay text, with padTop = (sh - textHeight)/2, also places text at the vertical center. **These match.** ✓

## Summary of Actual Bugs to Fix

1. **BUG 1 (standalone text valign)**: Partially mitigated by padTop/padBottom, but breaks when `scaledH > lineHeight + 4` (tall bounds with small text). The textarea height shatches scaledH in that case, so padTop = (scaledH - textHeight)/2. This should match the canvas rendering. **Actually need to verify with real rendering.**

2. **BUG 4 (bounds freshness)**: Call `finalize_bounds()` before `get_node_bounds()`. This is the most likely cause of the user's reported bug — positioned text nodes returning stale x/y.

3. **BUG 6 (dual positioning strategy)**: Cosmetic concern; matching is verified correct when sh=scaledH.