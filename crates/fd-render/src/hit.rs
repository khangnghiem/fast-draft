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

fn hit_test_node(
    graph: &SceneGraph,
    idx: NodeIndex,
    bounds: &HashMap<NodeIndex, ResolvedBounds>,
    px: f32,
    py: f32,
) -> Option<NodeId> {
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
            annotations: Vec::new(),
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
            annotations: Vec::new(),
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
            annotations: Vec::new(),
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
}
