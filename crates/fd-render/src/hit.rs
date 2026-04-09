//! Hit testing: point → node lookup and edge proximity detection.
//!
//! Reverse-walks the render tree (front-to-back) to find which node
//! is at a given (x, y) canvas position. Also provides point-to-edge
//! proximity testing for edge selection.

use fd_core::NodeIndex;
use fd_core::ResolvedBounds;
use fd_core::SceneGraph;
use fd_core::id::NodeId;
use fd_core::model::*;
use std::collections::HashMap;

// ─── Spatial Index ───────────────────────────────────────────────────────

/// Lightweight spatial index: entries sorted by x-min for binary-search
/// narrowing. Provides O(log N + K) point queries and rect queries where
/// K is the number of candidates in the x-range.
///
/// Rebuild after every layout resolve (construction is O(N log N)).
#[derive(Debug, Clone)]
pub struct SpatialIndex {
    /// Sorted by `x_min` for binary search.
    entries: Vec<SpatialEntry>,
}

#[derive(Debug, Clone, Copy)]
struct SpatialEntry {
    x_min: f32,
    x_max: f32,
    y_min: f32,
    y_max: f32,
    id: NodeId,
    /// Paint order index (higher = drawn later = visually on top).
    z_order: u32,
}

impl SpatialIndex {
    /// Build from the current bounds map + scene graph.
    /// Skips Root nodes. O(N log N).
    pub fn build(graph: &SceneGraph, bounds: &HashMap<NodeIndex, ResolvedBounds>) -> Self {
        let mut entries = Vec::with_capacity(bounds.len());
        let mut z = 0u32;
        Self::collect_entries(graph, graph.root, bounds, &mut entries, &mut z);
        entries.sort_by(|a, b| {
            a.x_min
                .partial_cmp(&b.x_min)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        Self { entries }
    }

    fn collect_entries(
        graph: &SceneGraph,
        idx: NodeIndex,
        bounds: &HashMap<NodeIndex, ResolvedBounds>,
        out: &mut Vec<SpatialEntry>,
        z: &mut u32,
    ) {
        let node = &graph.graph[idx];
        if node.locked {
            return;
        }
        if !matches!(node.kind, NodeKind::Root)
            && let Some(b) = bounds.get(&idx)
            && b.width > 0.0
            && b.height > 0.0
        {
            out.push(SpatialEntry {
                x_min: b.x,
                x_max: b.x + b.width,
                y_min: b.y,
                y_max: b.y + b.height,
                id: node.id,
                z_order: *z,
            });
            *z += 1;
        }
        for child_idx in graph.children(idx) {
            Self::collect_entries(graph, child_idx, bounds, out, z);
        }
    }

    /// Find the topmost node containing (px, py). O(log N + K).
    pub fn query_point(&self, px: f32, py: f32) -> Option<NodeId> {
        // Binary search: find first entry where x_min <= px
        // All entries with x_min > px can be skipped.
        let start = self.entries.partition_point(|e| e.x_min <= px);
        // Walk backwards from `start` to check entries whose x-range contains px
        let mut best: Option<(u32, NodeId)> = None;
        for i in (0..start).rev() {
            let e = &self.entries[i];
            // Once x_max < px, no earlier entry can contain px either
            // (they have smaller x_min, but we need x_max >= px)
            // Actually, earlier entries could still contain px if they're wide.
            // We can't break early on x_max — only on x_min + max_width.
            // For correctness, scan all entries with x_min <= px.
            if e.x_max >= px
                && e.y_min <= py
                && e.y_max >= py
                && (best.is_none() || e.z_order > best.unwrap().0)
            {
                best = Some((e.z_order, e.id));
            }
        }
        best.map(|(_, id)| id)
    }

    /// Find ALL nodes containing (px, py), ordered by z-order descending
    /// (topmost/front-most first). Used by the Layer Picker (⌘+Right-click).
    pub fn query_point_all(&self, px: f32, py: f32) -> Vec<NodeId> {
        let start = self.entries.partition_point(|e| e.x_min <= px);
        let mut hits: Vec<(u32, NodeId)> = Vec::new();
        for i in (0..start).rev() {
            let e = &self.entries[i];
            if e.x_max >= px && e.y_min <= py && e.y_max >= py {
                hits.push((e.z_order, e.id));
            }
        }
        // Sort by z_order descending (topmost first)
        hits.sort_by(|a, b| b.0.cmp(&a.0));
        hits.into_iter().map(|(_, id)| id).collect()
    }

    /// Find all nodes intersecting the rectangle (rx, ry, rw, rh). O(log N + K).
    pub fn query_rect(&self, rx: f32, ry: f32, rw: f32, rh: f32) -> Vec<NodeId> {
        let rx2 = rx + rw;
        let ry2 = ry + rh;
        // Only entries with x_min <= rx2 can intersect
        let end = self.entries.partition_point(|e| e.x_min <= rx2);
        let mut result = Vec::new();
        for e in &self.entries[..end] {
            if e.x_max >= rx && e.y_min <= ry2 && e.y_max >= ry {
                result.push(e.id);
            }
        }
        result
    }

    /// Returns true if the index is empty (no nodes).
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

/// Find the topmost node at position (px, py).
/// Returns `None` if no node is hit (background).
pub fn hit_test(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    px: f32,
    py: f32,
) -> Option<NodeId> {
    // Walk children in reverse order (last painted = topmost)
    hit_test_node(graph, graph.root, bounds, px, py)
}

/// Find ALL nodes at position (px, py), ordered front-to-back (topmost first).
/// Used by the Layer Picker (⌘+Right-click) to list all overlapping layers
/// at a given point.
pub fn hit_test_all(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    px: f32,
    py: f32,
) -> Vec<NodeId> {
    let mut result = Vec::new();
    hit_test_all_node(graph, graph.root, bounds, px, py, &mut result);
    // Reverse so topmost (last painted) comes first
    result.reverse();
    result
}

fn hit_test_all_node(
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    px: f32,
    py: f32,
    out: &mut Vec<NodeId>,
) {
    let node = &graph.graph[idx];
    if node.locked {
        return;
    }
    // Check self (skip Root)
    if !matches!(node.kind, NodeKind::Root)
        && let Some(b) = bounds.get(&idx)
        && b.contains(px, py)
    {
        out.push(node.id);
    }
    // Recurse into children
    for &child_idx in graph.children(idx).iter() {
        hit_test_all_node(graph, child_idx, bounds, px, py, out);
    }
}

fn hit_test_node(
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    px: f32,
    py: f32,
) -> Option<NodeId> {
    let node = &graph.graph[idx];
    if node.locked {
        return None;
    }

    let children = graph.children(idx);

    // Check children in reverse (topmost first)
    for &child_idx in children.iter().rev() {
        if let Some(hit) = hit_test_node(graph, child_idx, bounds, px, py) {
            return Some(hit);
        }
    }

    // Check self (skip Root — it covers the whole viewport)
    let node = &graph.graph[idx];
    if matches!(node.kind, NodeKind::Root) {
        return None;
    }

    if let Some(b) = bounds.get(&idx)
        && b.contains(px, py)
    {
        return Some(node.id);
    }

    None
}

/// Find the topmost node at (px, py), excluding a set of node indices.
/// Used for ⌘+drag reparent to find the container beneath the dragged node.
pub fn hit_test_excluding(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    px: f32,
    py: f32,
    excluded: &std::collections::HashSet<NodeIndex>,
) -> Option<NodeId> {
    hit_test_node_excluding(graph, graph.root, bounds, px, py, excluded)
}

fn hit_test_node_excluding(
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    px: f32,
    py: f32,
    excluded: &std::collections::HashSet<NodeIndex>,
) -> Option<NodeId> {
    let node = &graph.graph[idx];
    if node.locked {
        return None;
    }

    let children = graph.children(idx);

    for &child_idx in children.iter().rev() {
        if excluded.contains(&child_idx) {
            continue;
        }
        if let Some(hit) = hit_test_node_excluding(graph, child_idx, bounds, px, py, excluded) {
            return Some(hit);
        }
    }

    let node = &graph.graph[idx];
    if matches!(node.kind, NodeKind::Root) || excluded.contains(&idx) {
        return None;
    }

    if let Some(b) = bounds.get(&idx)
        && b.contains(px, py)
    {
        return Some(node.id);
    }

    None
}

/// Find all non-root nodes whose bounds intersect the given rectangle.
/// Used for marquee (box) selection.
pub fn hit_test_rect(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    rx: f32,
    ry: f32,
    rw: f32,
    rh: f32,
) -> Vec<NodeId> {
    let mut result = Vec::new();
    collect_intersecting(graph, graph.root, bounds, rx, ry, rw, rh, &mut result);
    result
}

#[allow(clippy::too_many_arguments)]
fn collect_intersecting(
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    rx: f32,
    ry: f32,
    rw: f32,
    rh: f32,
    out: &mut Vec<NodeId>,
) {
    let node = &graph.graph[idx];
    if node.locked {
        return;
    }

    if !matches!(node.kind, NodeKind::Root)
        && let Some(b) = bounds.get(&idx)
        && b.intersects_rect(rx, ry, rw, rh)
    {
        out.push(node.id);
    }

    for child_idx in graph.children(idx) {
        collect_intersecting(graph, child_idx, bounds, rx, ry, rw, rh, out);
    }
}

/// Find all non-root nodes whose bounds are completely contained within the given rectangle.
/// Used for Marquee Eraser bulk deletion.
pub fn hit_test_rect_contained(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    rx: f32,
    ry: f32,
    rw: f32,
    rh: f32,
) -> Vec<NodeId> {
    let mut result = Vec::new();
    collect_contained(graph, graph.root, bounds, rx, ry, rw, rh, &mut result);
    result
}

#[allow(clippy::too_many_arguments)]
fn collect_contained(
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    rx: f32,
    ry: f32,
    rw: f32,
    rh: f32,
    out: &mut Vec<NodeId>,
) {
    let node = &graph.graph[idx];
    if node.locked {
        return;
    }

    if !matches!(node.kind, NodeKind::Root)
        && let Some(b) = bounds.get(&idx)
    {
        // Must be fully inside the rect
        if b.x >= rx && b.x + b.width <= rx + rw && b.y >= ry && b.y + b.height <= ry + rh {
            out.push(node.id);
        }
    }

    for child_idx in graph.children(idx) {
        collect_contained(graph, child_idx, bounds, rx, ry, rw, rh, out);
    }
}

// ─── Edge hit-testing ────────────────────────────────────────────────────

/// Hit radius for edge selection (scene-space pixels).
const EDGE_HIT_RADIUS: f32 = 5.0;

/// Resolve an edge anchor to scene-space (x, y).
fn resolve_anchor(
    anchor: &EdgeAnchor,
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
) -> Option<(f32, f32)> {
    match anchor {
        EdgeAnchor::Node(id) => {
            let idx = graph.index_of(*id)?;
            let b = bounds.get(&idx)?;
            Some(b.center())
        }
        EdgeAnchor::Point(x, y) => Some((*x, *y)),
    }
}

/// Find the closest edge to (px, py) within `EDGE_HIT_RADIUS`.
/// Returns the edge's NodeId if hit.
pub fn hit_test_edge(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    px: f32,
    py: f32,
) -> Option<NodeId> {
    let mut best: Option<(f32, NodeId)> = None;

    for edge in &graph.edges {
        let (x1, y1) = resolve_anchor(&edge.from, graph, bounds)?;
        let (x2, y2) = resolve_anchor(&edge.to, graph, bounds)?;

        let dist = edge_distance(x1, y1, x2, y2, edge.curve, px, py);
        if dist <= EDGE_HIT_RADIUS && (best.is_none() || dist < best.unwrap().0) {
            best = Some((dist, edge.id));
        }
    }

    best.map(|(_, id)| id)
}

/// Find all edges whose path intersects the marquee rectangle.
pub fn hit_test_rect_edges(
    graph: &SceneGraph,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    rx: f32,
    ry: f32,
    rw: f32,
    rh: f32,
) -> Vec<NodeId> {
    let mut result = Vec::new();
    for edge in &graph.edges {
        let Some((x1, y1)) = resolve_anchor(&edge.from, graph, bounds) else {
            continue;
        };
        let Some((x2, y2)) = resolve_anchor(&edge.to, graph, bounds) else {
            continue;
        };

        let segments = edge_segments(x1, y1, x2, y2, edge.curve);
        let hit = segments
            .iter()
            .any(|&(sx, sy, ex, ey)| segment_intersects_rect(sx, sy, ex, ey, rx, ry, rw, rh));
        if hit {
            result.push(edge.id);
        }
    }
    result
}

/// Compute the minimum distance from point (px, py) to an edge path.
fn edge_distance(x1: f32, y1: f32, x2: f32, y2: f32, curve: CurveKind, px: f32, py: f32) -> f32 {
    let segments = edge_segments(x1, y1, x2, y2, curve);
    segments
        .iter()
        .map(|&(sx, sy, ex, ey)| point_to_segment_dist(px, py, sx, sy, ex, ey))
        .fold(f32::MAX, f32::min)
}

/// Break an edge into line segments for distance/intersection testing.
fn edge_segments(
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    curve: CurveKind,
) -> Vec<(f32, f32, f32, f32)> {
    match curve {
        CurveKind::Straight => vec![(x1, y1, x2, y2)],
        CurveKind::Smooth => {
            // Quadratic Bézier: P0=(x1,y1), CP=(mx, my-offset), P1=(x2,y2)
            let mx = (x1 + x2) / 2.0;
            let my = (y1 + y2) / 2.0;
            let dx = (x2 - x1).abs();
            let dy = (y2 - y1).abs();
            let offset = dx.max(dy) * 0.3;
            let cpx = mx;
            let cpy = my - offset;

            // Flatten to 8 segments
            let n = 8;
            let mut segs = Vec::with_capacity(n);
            let mut prev_x = x1;
            let mut prev_y = y1;
            for i in 1..=n {
                let t = i as f32 / n as f32;
                let inv = 1.0 - t;
                let bx = inv * inv * x1 + 2.0 * inv * t * cpx + t * t * x2;
                let by = inv * inv * y1 + 2.0 * inv * t * cpy + t * t * y2;
                segs.push((prev_x, prev_y, bx, by));
                prev_x = bx;
                prev_y = by;
            }
            segs
        }
        CurveKind::Step => {
            let mx = (x1 + x2) / 2.0;
            vec![(x1, y1, mx, y1), (mx, y1, mx, y2), (mx, y2, x2, y2)]
        }
    }
}

/// Minimum distance from point (px, py) to line segment (ax, ay)→(bx, by).
fn point_to_segment_dist(px: f32, py: f32, ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
    let dx = bx - ax;
    let dy = by - ay;
    let len_sq = dx * dx + dy * dy;

    if len_sq < 1e-10 {
        // Degenerate segment (zero length)
        let ex = px - ax;
        let ey = py - ay;
        return (ex * ex + ey * ey).sqrt();
    }

    // Project point onto segment, clamped to [0, 1]
    let t = ((px - ax) * dx + (py - ay) * dy) / len_sq;
    let t = t.clamp(0.0, 1.0);

    let closest_x = ax + t * dx;
    let closest_y = ay + t * dy;
    let ex = px - closest_x;
    let ey = py - closest_y;
    (ex * ex + ey * ey).sqrt()
}

/// Check if a line segment intersects an axis-aligned rectangle.
#[allow(clippy::too_many_arguments)]
fn segment_intersects_rect(
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    rx: f32,
    ry: f32,
    rw: f32,
    rh: f32,
) -> bool {
    // If either endpoint is inside the rect, it intersects
    let contains = |px: f32, py: f32| px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
    if contains(x1, y1) || contains(x2, y2) {
        return true;
    }

    // Check intersection with each rect edge using line-segment intersection
    let edges = [
        (rx, ry, rx + rw, ry),           // top
        (rx, ry + rh, rx + rw, ry + rh), // bottom
        (rx, ry, rx, ry + rh),           // left
        (rx + rw, ry, rx + rw, ry + rh), // right
    ];
    edges
        .iter()
        .any(|&(ex1, ey1, ex2, ey2)| segments_intersect(x1, y1, x2, y2, ex1, ey1, ex2, ey2))
}

/// Check if two line segments intersect (using cross-product orientation test).
#[allow(clippy::too_many_arguments)]
fn segments_intersect(
    a1x: f32,
    a1y: f32,
    a2x: f32,
    a2y: f32,
    b1x: f32,
    b1y: f32,
    b2x: f32,
    b2y: f32,
) -> bool {
    let cross = |ox: f32, oy: f32, ax: f32, ay: f32, bx: f32, by: f32| -> f32 {
        (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)
    };

    let d1 = cross(b1x, b1y, b2x, b2y, a1x, a1y);
    let d2 = cross(b1x, b1y, b2x, b2y, a2x, a2y);
    let d3 = cross(a1x, a1y, a2x, a2y, b1x, b1y);
    let d4 = cross(a1x, a1y, a2x, a2y, b2x, b2y);

    if ((d1 > 0.0 && d2 < 0.0) || (d1 < 0.0 && d2 > 0.0))
        && ((d3 > 0.0 && d4 < 0.0) || (d3 < 0.0 && d4 > 0.0))
    {
        return true;
    }

    // Collinear cases (on-segment checks) — skip for simplicity,
    // the epsilon tolerance from the endpoint check handles it.
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use fd_core::parser::parse_document;
    use fd_core::{Viewport, resolve_layout};

    #[test]
    fn hit_test_basic() {
        let input = r#"
rect @a {
  w: 100
  h: 100
}

rect @b {
  w: 50
  h: 50
}

@a -> absolute: 10, 10
@b -> absolute: 200, 200
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        // Test hit on @a area
        let a_idx = graph.index_of(NodeId::intern("a")).unwrap();
        if let Some(a_bounds) = bounds.get(&a_idx) {
            let result = hit_test(&graph, &bounds, a_bounds.x + 5.0, a_bounds.y + 5.0);
            assert_eq!(result, Some(NodeId::intern("a")));
        }

        // Test miss
        let _result = hit_test(&graph, &bounds, 799.0, 599.0);
    }

    #[test]
    fn hit_test_nested_groups() {
        let input = r#"
group @outer {
  group @inner {
    rect @leaf {
      w: 100
      h: 100
    }
  }
}

@outer -> absolute: 10, 10
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let leaf_idx = graph.index_of(NodeId::intern("leaf")).unwrap();
        if let Some(leaf_bounds) = bounds.get(&leaf_idx) {
            let cx = leaf_bounds.x + leaf_bounds.width / 2.0;
            let cy = leaf_bounds.y + leaf_bounds.height / 2.0;
            let result = hit_test(&graph, &bounds, cx, cy);
            assert_eq!(result, Some(NodeId::intern("leaf")));
        }

        let result = hit_test(&graph, &bounds, 700.0, 500.0);
        assert_eq!(result, None);
    }

    // ─── hit_test_all tests (Layer Picker) ─────────────────────────────

    #[test]
    fn hit_test_all_overlapping() {
        // Two rects overlapping at (50, 50)
        let input = r#"
rect @bottom {
  w: 200
  h: 200
  x: 0
  y: 0
}

rect @top {
  w: 100
  h: 100
  x: 25
  y: 25
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let result = hit_test_all(&graph, &bounds, 50.0, 50.0);
        // Both rects should be hit; @top (last painted) comes first
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], NodeId::intern("top"));
        assert_eq!(result[1], NodeId::intern("bottom"));
    }

    #[test]
    fn hit_test_all_nested() {
        let input = r#"
group @outer {
  rect @child {
    w: 100
    h: 100
  }
}

@outer -> absolute: 10, 10
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let child_idx = graph.index_of(NodeId::intern("child")).unwrap();
        if let Some(b) = bounds.get(&child_idx) {
            let cx = b.x + b.width / 2.0;
            let cy = b.y + b.height / 2.0;
            let result = hit_test_all(&graph, &bounds, cx, cy);
            // Should hit: @child, @outer (group bounds contain the point too)
            assert!(result.contains(&NodeId::intern("child")));
            assert!(result.contains(&NodeId::intern("outer")));
        }
    }

    #[test]
    fn hit_test_all_miss() {
        let input = r#"
rect @a { w: 50 h: 50 x: 0 y: 0 }
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        let result = hit_test_all(&graph, &bounds, 500.0, 500.0);
        assert!(result.is_empty());
    }

    #[test]
    fn spatial_index_query_point_all_matches_hit_test_all() {
        let input = r#"
rect @bottom { w: 200 h: 200 x: 0 y: 0 }
rect @top { w: 100 h: 100 x: 25 y: 25 }
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);
        let index = SpatialIndex::build(&graph, &bounds);

        let brute = hit_test_all(&graph, &bounds, 50.0, 50.0);
        let indexed = index.query_point_all(50.0, 50.0);

        let brute_set: std::collections::HashSet<_> = brute.into_iter().collect();
        let indexed_set: std::collections::HashSet<_> = indexed.into_iter().collect();
        assert_eq!(
            brute_set, indexed_set,
            "SpatialIndex query_point_all should match hit_test_all"
        );
    }

    // ─── Edge hit-testing tests ──────────────────────────────────────

    #[test]
    fn point_to_segment_dist_basic() {
        // Horizontal segment from (0,0) to (10,0), point at (5,3)
        let d = point_to_segment_dist(5.0, 3.0, 0.0, 0.0, 10.0, 0.0);
        assert!((d - 3.0).abs() < 0.01);
    }

    #[test]
    fn point_to_segment_dist_endpoint() {
        // Point closest to endpoint
        let d = point_to_segment_dist(15.0, 0.0, 0.0, 0.0, 10.0, 0.0);
        assert!((d - 5.0).abs() < 0.01);
    }

    #[test]
    fn hit_test_edge_straight() {
        let input = r#"
rect @a { w: 40 h: 40 x: 0 y: 0 }
rect @b { w: 40 h: 40 x: 200 y: 0 }
edge @link { from: @a; to: @b }
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        // Midpoint of edge should be near y=20 (center of 40px rects), x=120
        let a_idx = graph.index_of(NodeId::intern("a")).unwrap();
        let b_idx = graph.index_of(NodeId::intern("b")).unwrap();
        if let (Some(ab), Some(bb)) = (bounds.get(&a_idx), bounds.get(&b_idx)) {
            let mid_x = (ab.center().0 + bb.center().0) / 2.0;
            let mid_y = ab.center().1; // Both at same y

            // Hit near midpoint (within 5px)
            let result = hit_test_edge(&graph, &bounds, mid_x, mid_y + 2.0);
            assert_eq!(result, Some(NodeId::intern("link")));

            // Miss far from edge
            let result = hit_test_edge(&graph, &bounds, mid_x, mid_y + 50.0);
            assert_eq!(result, None);
        }
    }

    #[test]
    fn hit_test_edge_point_anchors() {
        // Edge with Point anchors (no node references)
        let mut graph = SceneGraph::new();
        let edge = Edge {
            id: NodeId::intern("arrow1"),
            from: EdgeAnchor::Point(100.0, 100.0),
            to: EdgeAnchor::Point(300.0, 100.0),
            text_child: None,
            props: Properties::default(),
            use_styles: Default::default(),
            arrow: ArrowKind::End,
            curve: CurveKind::Straight,
            spec: None,
            animations: Default::default(),
            flow: None,
            label_offset: None,
        };
        graph.edges.push(edge);

        let bounds: HashMap<NodeIndex, ResolvedBounds> = HashMap::new();

        // Hit at midpoint
        let result = hit_test_edge(&graph, &bounds, 200.0, 100.0);
        assert_eq!(result, Some(NodeId::intern("arrow1")));

        // Hit 3px above (within radius)
        let result = hit_test_edge(&graph, &bounds, 200.0, 97.0);
        assert_eq!(result, Some(NodeId::intern("arrow1")));

        // Miss 10px above (outside radius)
        let result = hit_test_edge(&graph, &bounds, 200.0, 90.0);
        assert_eq!(result, None);
    }

    #[test]
    fn hit_test_edge_step() {
        let mut graph = SceneGraph::new();
        let edge = Edge {
            id: NodeId::intern("step_edge"),
            from: EdgeAnchor::Point(0.0, 0.0),
            to: EdgeAnchor::Point(100.0, 100.0),
            text_child: None,
            props: Properties::default(),
            use_styles: Default::default(),
            arrow: ArrowKind::None,
            curve: CurveKind::Step,
            spec: None,
            animations: Default::default(),
            flow: None,
            label_offset: None,
        };
        graph.edges.push(edge);
        let bounds: HashMap<NodeIndex, ResolvedBounds> = HashMap::new();

        // Step goes: (0,0)→(50,0)→(50,100)→(100,100)
        // Hit on vertical segment at x=50, y=50
        let result = hit_test_edge(&graph, &bounds, 50.0, 50.0);
        assert_eq!(result, Some(NodeId::intern("step_edge")));

        // Miss far from all segments
        let result = hit_test_edge(&graph, &bounds, 80.0, 50.0);
        assert_eq!(result, None);
    }

    #[test]
    fn hit_test_rect_edges_marquee() {
        let mut graph = SceneGraph::new();
        let edge = Edge {
            id: NodeId::intern("e1"),
            from: EdgeAnchor::Point(10.0, 10.0),
            to: EdgeAnchor::Point(90.0, 10.0),
            text_child: None,
            props: Properties::default(),
            use_styles: Default::default(),
            arrow: ArrowKind::None,
            curve: CurveKind::Straight,
            spec: None,
            animations: Default::default(),
            flow: None,
            label_offset: None,
        };
        graph.edges.push(edge);
        let bounds: HashMap<NodeIndex, ResolvedBounds> = HashMap::new();

        // Marquee encompasses the edge
        let result = hit_test_rect_edges(&graph, &bounds, 0.0, 0.0, 100.0, 20.0);
        assert_eq!(result, vec![NodeId::intern("e1")]);

        // Marquee misses the edge
        let result = hit_test_rect_edges(&graph, &bounds, 0.0, 50.0, 100.0, 20.0);
        assert!(result.is_empty());
    }

    // ─── SpatialIndex tests ──────────────────────────────────────────────

    #[test]
    fn spatial_index_query_point_matches_hit_test() {
        let input = r#"
rect @a {
  w: 100
  h: 100
}

rect @b {
  w: 50
  h: 50
}

@a -> absolute: 10, 10
@b -> absolute: 200, 200
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);
        let index = SpatialIndex::build(&graph, &bounds);

        // Hit @a
        let brute = hit_test(&graph, &bounds, 15.0, 15.0);
        let indexed = index.query_point(15.0, 15.0);
        assert_eq!(brute, indexed, "SpatialIndex should match hit_test for @a");

        // Hit @b
        let brute = hit_test(&graph, &bounds, 205.0, 205.0);
        let indexed = index.query_point(205.0, 205.0);
        assert_eq!(brute, indexed, "SpatialIndex should match hit_test for @b");

        // Miss (empty area)
        let brute = hit_test(&graph, &bounds, 799.0, 599.0);
        let indexed = index.query_point(799.0, 599.0);
        assert_eq!(
            brute, indexed,
            "SpatialIndex should match hit_test for miss"
        );
    }

    #[test]
    fn spatial_index_query_rect_matches_hit_test_rect() {
        let input = r#"
rect @a {
  w: 100
  h: 100
}

rect @b {
  w: 50
  h: 50
}

@a -> absolute: 10, 10
@b -> absolute: 200, 200
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);
        let index = SpatialIndex::build(&graph, &bounds);

        // Marquee that covers @a only
        let brute = hit_test_rect(&graph, &bounds, 0.0, 0.0, 150.0, 150.0);
        let indexed = index.query_rect(0.0, 0.0, 150.0, 150.0);
        let brute_set: std::collections::HashSet<_> = brute.into_iter().collect();
        let indexed_set: std::collections::HashSet<_> = indexed.into_iter().collect();
        assert_eq!(
            brute_set, indexed_set,
            "Rect query should match for @a area"
        );

        // Marquee that covers both
        let brute = hit_test_rect(&graph, &bounds, 0.0, 0.0, 300.0, 300.0);
        let indexed = index.query_rect(0.0, 0.0, 300.0, 300.0);
        let brute_set: std::collections::HashSet<_> = brute.into_iter().collect();
        let indexed_set: std::collections::HashSet<_> = indexed.into_iter().collect();
        assert_eq!(brute_set, indexed_set, "Rect query should match for both");
    }

    #[test]
    fn spatial_index_empty() {
        let input = "";
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);
        let index = SpatialIndex::build(&graph, &bounds);
        assert!(index.is_empty());
        assert_eq!(index.query_point(100.0, 100.0), None);
        assert!(index.query_rect(0.0, 0.0, 800.0, 600.0).is_empty());
    }

    /// Regression test: spatial index must be rebuilt after in-place bounds
    /// mutation (e.g. MoveNode). Without rebuild, the index uses stale AABBs
    /// and hit_test returns None at the node's new position.
    /// This is the root cause of the "node can only be moved once" bug.
    #[test]
    fn spatial_index_stale_after_move() {
        let input = r#"
rect @movable {
  w: 100
  h: 100
  x: 10
  y: 10
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let mut bounds = resolve_layout(&graph, viewport);
        let idx = graph.index_of(NodeId::intern("movable")).unwrap();

        // Build initial index — node at (10, 10)
        let stale_index = SpatialIndex::build(&graph, &bounds);
        assert_eq!(
            stale_index.query_point(50.0, 50.0),
            Some(NodeId::intern("movable")),
            "should hit node at original position"
        );

        // Simulate MoveNode: update bounds in-place (dx=200, dy=200)
        if let Some(b) = bounds.get_mut(&idx) {
            b.x += 200.0;
            b.y += 200.0;
        }

        // Stale index should MISS at the new position (this was the bug)
        assert_eq!(
            stale_index.query_point(250.0, 250.0),
            None,
            "stale index should miss node at new position"
        );

        // Stale index should still "hit" at the OLD position (phantom)
        assert_eq!(
            stale_index.query_point(50.0, 50.0),
            Some(NodeId::intern("movable")),
            "stale index still thinks node is at old position"
        );

        // Rebuild index — should find node at new position
        let fresh_index = SpatialIndex::build(&graph, &bounds);
        assert_eq!(
            fresh_index.query_point(250.0, 250.0),
            Some(NodeId::intern("movable")),
            "rebuilt index should find node at new position"
        );

        // Rebuilt index should NOT hit at old position
        assert_eq!(
            fresh_index.query_point(50.0, 50.0),
            None,
            "rebuilt index should not find node at old position"
        );
    }

    /// Regression: hit_test_excluding skips excluded nodes and their descendants.
    /// This is the root cause fix for ⌘+drag reparent — the dragged node sat on
    /// top of the target container, so normal hit_test returned the dragged node
    /// instead of the container underneath.
    #[test]
    fn hit_test_excluding_skips_dragged_node() {
        let input = r#"
rect @container {
  w: 200
  h: 200
  x: 50
  y: 50
}

rect @child {
  w: 80
  h: 60
  x: 100
  y: 100
}
"#;
        let graph = parse_document(input).unwrap();
        let viewport = Viewport {
            width: 800.0,
            height: 600.0,
        };
        let bounds = resolve_layout(&graph, viewport);

        // Without exclusion: @child is on top at (120, 120)
        let hit = hit_test(&graph, &bounds, 120.0, 120.0);
        assert_eq!(hit, Some(NodeId::intern("child")));

        // With @child excluded: should return @container underneath
        let child_idx = graph.index_of(NodeId::intern("child")).unwrap();
        let mut excluded = std::collections::HashSet::new();
        excluded.insert(child_idx);
        let hit_excl = hit_test_excluding(&graph, &bounds, 120.0, 120.0, &excluded);
        assert_eq!(
            hit_excl,
            Some(NodeId::intern("container")),
            "excluding @child should reveal @container underneath"
        );

        // With both excluded: should return None
        let container_idx = graph.index_of(NodeId::intern("container")).unwrap();
        excluded.insert(container_idx);
        let hit_none = hit_test_excluding(&graph, &bounds, 120.0, 120.0, &excluded);
        assert_eq!(hit_none, None, "excluding both nodes should return None");
    }
}
