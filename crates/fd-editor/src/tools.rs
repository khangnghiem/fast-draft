//! Tool system for canvas interactions.
//!
//! Each tool translates user input events into `GraphMutation` commands
//! that are applied via the `SyncEngine`.
//!
//! ## Modifier behaviors
//!
//! | Modifier | Select Tool | Rect Tool | Pen Tool |
//! |----------|-------------|-----------|----------|
//! | **Shift** | Axis-constrain drag | Square constraint | — |
//! | **Alt** | Duplicate on drag start | Draw from center | — |
//!
//! Click-without-drag creates a shape with default size (100×100 rect, 50 radius ellipse).

use crate::input::InputEvent;
use crate::sync::GraphMutation;
use fd_core::id::NodeId;
use fd_core::model::*;

/// The active tool determines how input events are interpreted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolKind {
    Select,
    Rect,
    Ellipse,
    Pen,
    Text,
    Arrow,
    Frame,
    Eraser,
}

/// Trait for tools that handle input and produce mutations.
pub trait Tool {
    fn kind(&self) -> ToolKind;

    /// Handle an input event, returning zero or more mutations.
    fn handle(&mut self, event: &InputEvent, hit_node: Option<NodeId>) -> Vec<GraphMutation>;
}

// ─── Resize Handle Positions ─────────────────────────────────────────────

/// Positions of the 8-point resize handles around a selected node.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResizeHandle {
    TopLeft,
    TopCenter,
    TopRight,
    MiddleLeft,
    MiddleRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

// ─── Select Tool ─────────────────────────────────────────────────────────

pub struct SelectTool {
    /// Currently selected node(s) — logical selection for operations.
    pub selected: Vec<NodeId>,
    /// Nodes to visually highlight on canvas.
    /// Differs from `selected` when a group is selected via child click —
    /// `selected` holds the group, `visual_highlight` holds the clicked child.
    pub visual_highlight: Vec<NodeId>,
    /// Drag state (moving a selected node).
    dragging: bool,
    last_x: f32,
    last_y: f32,
    /// Whether we duplicated on this drag (Alt+drag).
    alt_duplicated: bool,
    /// Marquee (rubber-band) selection state.
    /// Set when pointer-down hits empty space. `(start_x, start_y)`.
    pub marquee_start: Option<(f32, f32)>,
    /// Current marquee rectangle (normalized: x, y, w, h). Updated during drag.
    pub marquee_rect: Option<(f32, f32, f32, f32)>,
    /// Resize handle being dragged (None = not resizing).
    pub resize_handle: Option<ResizeHandle>,
    /// Original bounds at resize start (x, y, w, h).
    resize_origin: (f32, f32, f32, f32),
    /// Fixed anchor point during resize (opposite corner/edge).
    resize_anchor: (f32, f32),
}

impl Default for SelectTool {
    fn default() -> Self {
        Self::new()
    }
}

impl SelectTool {
    pub fn new() -> Self {
        Self {
            selected: Vec::new(),
            visual_highlight: Vec::new(),
            dragging: false,
            last_x: 0.0,
            last_y: 0.0,
            alt_duplicated: false,
            marquee_start: None,
            marquee_rect: None,
            resize_handle: None,
            resize_origin: (0.0, 0.0, 0.0, 0.0),
            resize_anchor: (0.0, 0.0),
        }
    }

    /// Start a resize interaction on a specific handle.
    /// Called by FdCanvas when pointer-down hits a handle.
    pub fn start_resize(&mut self, handle: ResizeHandle, bounds: (f32, f32, f32, f32)) {
        let (x, y, w, h) = bounds;
        self.resize_handle = Some(handle);
        self.resize_origin = bounds;
        // Anchor is the opposite corner/edge that stays fixed
        self.resize_anchor = match handle {
            ResizeHandle::TopLeft => (x + w, y + h),
            ResizeHandle::TopCenter => (x + w / 2.0, y + h),
            ResizeHandle::TopRight => (x, y + h),
            ResizeHandle::MiddleLeft => (x + w, y + h / 2.0),
            ResizeHandle::MiddleRight => (x, y + h / 2.0),
            ResizeHandle::BottomLeft => (x + w, y),
            ResizeHandle::BottomCenter => (x + w / 2.0, y),
            ResizeHandle::BottomRight => (x, y),
        };
    }

    /// Get the first selected node (backward compatibility).
    pub fn first_selected(&self) -> Option<NodeId> {
        self.selected.first().copied()
    }

    /// Normalize a drag rectangle from start + current positions.
    fn normalize_rect(x1: f32, y1: f32, x2: f32, y2: f32) -> (f32, f32, f32, f32) {
        let rx = x1.min(x2);
        let ry = y1.min(y2);
        let rw = (x2 - x1).abs();
        let rh = (y2 - y1).abs();
        (rx, ry, rw, rh)
    }
}

impl Tool for SelectTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Select
    }

    fn handle(&mut self, event: &InputEvent, hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown {
                x, y, modifiers, ..
            } => {
                self.marquee_start = None;
                self.marquee_rect = None;

                // If resize_handle is set (by FdCanvas), skip normal selection
                if self.resize_handle.is_some() {
                    return vec![];
                }

                if let Some(hit_id) = hit_node {
                    // Shift+click: toggle node in/out of selection
                    if modifiers.shift {
                        if let Some(pos) = self.selected.iter().position(|id| *id == hit_id) {
                            self.selected.remove(pos);
                        } else {
                            self.selected.push(hit_id);
                        }
                    } else if !self.selected.contains(&hit_id) {
                        // Click on unselected node: replace selection
                        self.selected = vec![hit_id];
                    }
                    // If clicking on already-selected node, keep selection (for drag)

                    self.dragging = true;
                    self.last_x = *x;
                    self.last_y = *y;
                    self.alt_duplicated = false;

                    // Alt+click on a node → duplicate
                    if modifiers.alt && self.selected.len() == 1 {
                        self.alt_duplicated = true;
                        return vec![GraphMutation::DuplicateNode { id: hit_id }];
                    }

                    vec![]
                } else {
                    // Click on empty space: start marquee
                    if !modifiers.shift {
                        self.selected.clear();
                    }
                    self.dragging = false;
                    self.marquee_start = Some((*x, *y));
                    self.marquee_rect = Some((*x, *y, 0.0, 0.0));
                    vec![]
                }
            }
            InputEvent::PointerMove {
                x, y, modifiers, ..
            } => {
                // Resize drag
                if let Some(handle) = self.resize_handle
                    && let Some(id) = self.first_selected()
                {
                    let (ax, ay) = self.resize_anchor;
                    let mut mx = *x;
                    let mut my = *y;

                    // Shift: constrain to square
                    if modifiers.shift {
                        let dw = (mx - ax).abs();
                        let dh = (my - ay).abs();
                        let side = dw.max(dh);
                        mx = if mx > ax { ax + side } else { ax - side };
                        my = if my > ay { ay + side } else { ay - side };
                    }

                    // Compute new bounds from anchor + cursor
                    let (new_x, new_w) = match handle {
                        ResizeHandle::TopLeft
                        | ResizeHandle::MiddleLeft
                        | ResizeHandle::BottomLeft => {
                            let nx = mx.min(ax);
                            (nx, (mx - ax).abs())
                        }
                        ResizeHandle::TopRight
                        | ResizeHandle::MiddleRight
                        | ResizeHandle::BottomRight => {
                            let nx = mx.min(ax);
                            (nx, (mx - ax).abs())
                        }
                        ResizeHandle::TopCenter | ResizeHandle::BottomCenter => {
                            (self.resize_origin.0, self.resize_origin.2)
                        }
                    };
                    let (new_y, new_h) = match handle {
                        ResizeHandle::TopLeft
                        | ResizeHandle::TopCenter
                        | ResizeHandle::TopRight => {
                            let ny = my.min(ay);
                            (ny, (my - ay).abs())
                        }
                        ResizeHandle::BottomLeft
                        | ResizeHandle::BottomCenter
                        | ResizeHandle::BottomRight => {
                            let ny = my.min(ay);
                            (ny, (my - ay).abs())
                        }
                        ResizeHandle::MiddleLeft | ResizeHandle::MiddleRight => {
                            (self.resize_origin.1, self.resize_origin.3)
                        }
                    };

                    // Min size
                    let final_w = new_w.max(4.0);
                    let final_h = new_h.max(4.0);

                    // Compute position delta from original
                    let dx = new_x - self.resize_origin.0;
                    let dy = new_y - self.resize_origin.1;
                    self.resize_origin = (new_x, new_y, final_w, final_h);

                    let mut mutations = vec![GraphMutation::ResizeNode {
                        id,
                        width: final_w,
                        height: final_h,
                    }];
                    if dx.abs() > 0.001 || dy.abs() > 0.001 {
                        mutations.push(GraphMutation::MoveNode { id, dx, dy });
                    }
                    return mutations;
                }

                // Marquee drag
                if let Some((sx, sy)) = self.marquee_start {
                    self.marquee_rect = Some(Self::normalize_rect(sx, sy, *x, *y));
                    // Return empty — no graph mutation, but FdCanvas will re-render
                    return vec![];
                }

                // Node drag
                if self.dragging && !self.selected.is_empty() {
                    let mut dx = x - self.last_x;
                    let mut dy = y - self.last_y;
                    self.last_x = *x;
                    self.last_y = *y;

                    // Shift: constrain to dominant axis
                    if modifiers.shift {
                        if dx.abs() > dy.abs() {
                            dy = 0.0;
                        } else {
                            dx = 0.0;
                        }
                    }

                    // Move all selected nodes
                    return self
                        .selected
                        .iter()
                        .map(|id| GraphMutation::MoveNode { id: *id, dx, dy })
                        .collect();
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                // Marquee end is handled by FdCanvas (it calls hit_test_rect)
                self.dragging = false;
                self.alt_duplicated = false;
                self.resize_handle = None;
                vec![]
            }
            _ => vec![],
        }
    }
}

// ─── Rect Tool ───────────────────────────────────────────────────────────

pub struct RectTool {
    drawing: bool,
    dragged: bool,
    start_x: f32,
    start_y: f32,
    /// Track last computed top-left for Alt-from-center delta positioning.
    last_cx: f32,
    last_cy: f32,
    current_id: Option<NodeId>,
}

impl Default for RectTool {
    fn default() -> Self {
        Self::new()
    }
}

impl RectTool {
    pub fn new() -> Self {
        Self {
            drawing: false,
            dragged: false,
            start_x: 0.0,
            start_y: 0.0,
            last_cx: 0.0,
            last_cy: 0.0,
            current_id: None,
        }
    }
}

impl Tool for RectTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Rect
    }

    fn handle(&mut self, event: &InputEvent, _hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown { x, y, .. } => {
                self.drawing = true;
                self.dragged = false;
                self.start_x = *x;
                self.start_y = *y;
                self.last_cx = *x;
                self.last_cy = *y;
                let id = NodeId::with_prefix("rect");
                self.current_id = Some(id);

                let mut node = SceneNode::new(
                    id,
                    NodeKind::Rect {
                        width: 0.0,
                        height: 0.0,
                    },
                );
                node.constraints.push(Constraint::Position { x: *x, y: *y });
                vec![GraphMutation::AddNode {
                    parent_id: NodeId::intern("root"),
                    node: Box::new(node),
                }]
            }
            InputEvent::PointerMove {
                x, y, modifiers, ..
            } => {
                if self.drawing
                    && let Some(id) = self.current_id
                {
                    self.dragged = true;
                    let mut w = (x - self.start_x).abs();
                    let mut h = (y - self.start_y).abs();

                    // Shift: constrain to square
                    if modifiers.shift {
                        let side = w.max(h);
                        w = side;
                        h = side;
                    }

                    // Alt: draw from center (start point = center, not corner)
                    if modifiers.alt {
                        w *= 2.0;
                        h *= 2.0;
                        let new_cx = self.start_x - w / 2.0;
                        let new_cy = self.start_y - h / 2.0;
                        let dx = new_cx - self.last_cx;
                        let dy = new_cy - self.last_cy;
                        self.last_cx = new_cx;
                        self.last_cy = new_cy;
                        return vec![
                            GraphMutation::MoveNode { id, dx, dy },
                            GraphMutation::ResizeNode {
                                id,
                                width: w,
                                height: h,
                            },
                        ];
                    }

                    // Reposition origin to top-left corner so drawing
                    // works in all directions (north, west, etc.)
                    let origin_x = x.min(self.start_x);
                    let origin_y = y.min(self.start_y);
                    let dx = origin_x - self.last_cx;
                    let dy = origin_y - self.last_cy;
                    self.last_cx = origin_x;
                    self.last_cy = origin_y;

                    let mut mutations = vec![GraphMutation::ResizeNode {
                        id,
                        width: w,
                        height: h,
                    }];
                    if dx.abs() > 0.001 || dy.abs() > 0.001 {
                        mutations.insert(0, GraphMutation::MoveNode { id, dx, dy });
                    }
                    return mutations;
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                self.drawing = false;
                if !self.dragged {
                    if let Some(id) = self.current_id.take() {
                        // Click without drag → default 120×80 centered at click point
                        let w = 120.0_f32;
                        let h = 80.0_f32;
                        vec![
                            GraphMutation::ResizeNode {
                                id,
                                width: w,
                                height: h,
                            },
                            GraphMutation::MoveNode {
                                id,
                                dx: -w / 2.0,
                                dy: -h / 2.0,
                            },
                        ]
                    } else {
                        vec![]
                    }
                } else {
                    self.current_id = None;
                    vec![]
                }
            }
            _ => vec![],
        }
    }
}

// ─── Pen Tool (freehand) ─────────────────────────────────────────────────

pub struct PenTool {
    drawing: bool,
    points: Vec<(f32, f32)>,
    current_id: Option<NodeId>,
}

impl Default for PenTool {
    fn default() -> Self {
        Self::new()
    }
}

impl PenTool {
    pub fn new() -> Self {
        Self {
            drawing: false,
            points: Vec::new(),
            current_id: None,
        }
    }
}

impl Tool for PenTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Pen
    }

    fn handle(&mut self, event: &InputEvent, _hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown { x, y, .. } => {
                self.drawing = true;
                self.points.clear();
                self.points.push((*x, *y));
                let id = NodeId::with_prefix("path");
                self.current_id = Some(id);

                let path = NodeKind::Path {
                    commands: vec![PathCmd::MoveTo(*x, *y)],
                };
                let node = SceneNode::new(id, path);
                vec![GraphMutation::AddNode {
                    parent_id: NodeId::intern("root"),
                    node: Box::new(node),
                }]
            }
            InputEvent::PointerMove { x, y, .. } => {
                if self.drawing
                    && let Some(id) = self.current_id
                {
                    self.points.push((*x, *y));
                    // Emit a live LineTo so the path is visible during drawing.
                    // On PointerUp, these are replaced with smooth bezier curves.
                    let cmds = raw_points_to_lineto(&self.points);
                    return vec![GraphMutation::UpdatePath { id, commands: cmds }];
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                self.drawing = false;
                if let Some(id) = self.current_id.take() {
                    // Smooth the raw pointer samples into Catmull-Rom cubic bezier curves.
                    let cmds = points_to_smooth_bezier(&self.points);
                    self.points.clear();
                    return vec![GraphMutation::UpdatePath { id, commands: cmds }];
                }
                self.points.clear();
                vec![]
            }
            _ => vec![],
        }
    }
}

// ─── Path smoothing helpers ───────────────────────────────────────────────

/// Build a simple MoveTo + LineTo chain from raw points (used during live drawing).
fn raw_points_to_lineto(points: &[(f32, f32)]) -> Vec<PathCmd> {
    if points.is_empty() {
        return vec![];
    }
    let mut cmds = Vec::with_capacity(points.len());
    cmds.push(PathCmd::MoveTo(points[0].0, points[0].1));
    for &(x, y) in points.iter().skip(1) {
        cmds.push(PathCmd::LineTo(x, y));
    }
    cmds
}

/// Convert raw pointer points to a smooth cubic bezier spline using
/// Catmull-Rom → cubic Bézier conversion.
///
/// For each segment between point[i] and point[i+1], the two control
/// points are derived from the neighboring points, producing a C1-continuous
/// (tangent-smooth) spline. Tension is fixed at 1/6 (the classic value).
fn points_to_smooth_bezier(points: &[(f32, f32)]) -> Vec<PathCmd> {
    if points.len() < 2 {
        return raw_points_to_lineto(points);
    }
    if points.len() == 2 {
        return vec![
            PathCmd::MoveTo(points[0].0, points[0].1),
            PathCmd::LineTo(points[1].0, points[1].1),
        ];
    }

    let pts = subsample_points(points, 64);
    let n = pts.len();
    let mut cmds = Vec::with_capacity(n);
    cmds.push(PathCmd::MoveTo(pts[0].0, pts[0].1));

    for i in 0..(n - 1) {
        // Catmull-Rom: p[i-1], p[i], p[i+1], p[i+2]
        let p0 = if i == 0 { pts[0] } else { pts[i - 1] };
        let p1 = pts[i];
        let p2 = pts[i + 1];
        let p3 = if i + 2 < n { pts[i + 2] } else { pts[n - 1] };

        // Tangent at p1 = (p2 - p0) / 6
        let c1x = p1.0 + (p2.0 - p0.0) / 6.0;
        let c1y = p1.1 + (p2.1 - p0.1) / 6.0;

        // Tangent at p2 = (p3 - p1) / 6
        let c2x = p2.0 - (p3.0 - p1.0) / 6.0;
        let c2y = p2.1 - (p3.1 - p1.1) / 6.0;

        cmds.push(PathCmd::CubicTo(c1x, c1y, c2x, c2y, p2.0, p2.1));
    }

    cmds
}

/// Reduce a point cloud to at most `max_pts` evenly-spaced samples.
/// This keeps generated `.fd` path commands concise for typical strokes.
fn subsample_points(pts: &[(f32, f32)], max_pts: usize) -> Vec<(f32, f32)> {
    if pts.len() <= max_pts {
        return pts.to_vec();
    }
    let step = pts.len() as f32 / max_pts as f32;
    (0..max_pts)
        .map(|i| {
            let idx = ((i as f32 * step).round() as usize).min(pts.len() - 1);
            pts[idx]
        })
        .collect()
}

// ─── Ellipse Tool ────────────────────────────────────────────────────────

pub struct EllipseTool {
    drawing: bool,
    dragged: bool,
    start_x: f32,
    start_y: f32,
    /// Track last computed top-left for Alt-from-center delta positioning.
    last_cx: f32,
    last_cy: f32,
    current_id: Option<NodeId>,
}

impl Default for EllipseTool {
    fn default() -> Self {
        Self::new()
    }
}

impl EllipseTool {
    pub fn new() -> Self {
        Self {
            drawing: false,
            dragged: false,
            start_x: 0.0,
            start_y: 0.0,
            last_cx: 0.0,
            last_cy: 0.0,
            current_id: None,
        }
    }
}

impl Tool for EllipseTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Ellipse
    }

    fn handle(&mut self, event: &InputEvent, _hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown { x, y, .. } => {
                self.drawing = true;
                self.dragged = false;
                self.start_x = *x;
                self.start_y = *y;
                self.last_cx = *x;
                self.last_cy = *y;
                let id = NodeId::with_prefix("ellipse");
                self.current_id = Some(id);

                let mut node = SceneNode::new(id, NodeKind::Ellipse { rx: 0.0, ry: 0.0 });
                node.constraints.push(Constraint::Position { x: *x, y: *y });
                vec![GraphMutation::AddNode {
                    parent_id: NodeId::intern("root"),
                    node: Box::new(node),
                }]
            }
            InputEvent::PointerMove {
                x, y, modifiers, ..
            } => {
                if self.drawing
                    && let Some(id) = self.current_id
                {
                    self.dragged = true;
                    let mut w = (x - self.start_x).abs();
                    let mut h = (y - self.start_y).abs();

                    // Shift: constrain to circle
                    if modifiers.shift {
                        let side = w.max(h);
                        w = side;
                        h = side;
                    }

                    // Alt: draw from center (start point = center, not corner)
                    if modifiers.alt {
                        w *= 2.0;
                        h *= 2.0;
                        let new_cx = self.start_x - w / 2.0;
                        let new_cy = self.start_y - h / 2.0;
                        let dx = new_cx - self.last_cx;
                        let dy = new_cy - self.last_cy;
                        self.last_cx = new_cx;
                        self.last_cy = new_cy;
                        return vec![
                            GraphMutation::MoveNode { id, dx, dy },
                            GraphMutation::ResizeNode {
                                id,
                                width: w,
                                height: h,
                            },
                        ];
                    }

                    // Reposition origin to top-left corner so drawing
                    // works in all directions (north, west, etc.)
                    let origin_x = x.min(self.start_x);
                    let origin_y = y.min(self.start_y);
                    let dx = origin_x - self.last_cx;
                    let dy = origin_y - self.last_cy;
                    self.last_cx = origin_x;
                    self.last_cy = origin_y;

                    let mut mutations = vec![GraphMutation::ResizeNode {
                        id,
                        width: w,
                        height: h,
                    }];
                    if dx.abs() > 0.001 || dy.abs() > 0.001 {
                        mutations.insert(0, GraphMutation::MoveNode { id, dx, dy });
                    }
                    return mutations;
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                self.drawing = false;
                if !self.dragged {
                    if let Some(id) = self.current_id.take() {
                        // Click without drag → default 100×100 centered at click point
                        let w = 100.0_f32;
                        let h = 100.0_f32;
                        vec![
                            GraphMutation::ResizeNode {
                                id,
                                width: w,
                                height: h,
                            },
                            GraphMutation::MoveNode {
                                id,
                                dx: -w / 2.0,
                                dy: -h / 2.0,
                            },
                        ]
                    } else {
                        vec![]
                    }
                } else {
                    self.current_id = None;
                    vec![]
                }
            }
            _ => vec![],
        }
    }
}

// ─── Text Tool ───────────────────────────────────────────────────────────

pub struct TextTool {
    placed: bool,
}

impl Default for TextTool {
    fn default() -> Self {
        Self::new()
    }
}

impl TextTool {
    pub fn new() -> Self {
        Self { placed: false }
    }
}

impl Tool for TextTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Text
    }

    fn handle(&mut self, event: &InputEvent, _hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown { x, y, .. } => {
                if self.placed {
                    return vec![];
                }
                self.placed = true;
                let id = NodeId::with_prefix("text");
                let mut node = SceneNode::new(
                    id,
                    NodeKind::Text {
                        content: "Text".to_string(),
                    },
                );
                node.constraints.push(Constraint::Position { x: *x, y: *y });
                vec![GraphMutation::AddNode {
                    parent_id: NodeId::intern("root"),
                    node: Box::new(node),
                }]
            }
            InputEvent::PointerUp { .. } => {
                self.placed = false;
                vec![]
            }
            _ => vec![],
        }
    }
}

// ─── Arrow Tool (edge/connector) ─────────────────────────────────────────

pub struct ArrowTool {
    /// Start position of the drag (scene-space).
    start_pos: Option<(f32, f32)>,
    /// Source node the arrow originates from.
    source_node: Option<NodeId>,
    /// Current drag position for live preview.
    current_pos: Option<(f32, f32)>,
    /// Target node currently hovered during arrow drag.
    pub target_node: Option<NodeId>,
    /// Whether a drag is in progress.
    drawing: bool,
}

impl Default for ArrowTool {
    fn default() -> Self {
        Self::new()
    }
}

impl ArrowTool {
    pub fn new() -> Self {
        Self {
            start_pos: None,
            source_node: None,
            current_pos: None,
            target_node: None,
            drawing: false,
        }
    }

    /// Get the current preview line endpoints for rendering.
    /// Returns `Some((x1, y1, x2, y2))` during drag, `None` otherwise.
    pub fn preview_line(&self) -> Option<(f32, f32, f32, f32)> {
        if !self.drawing {
            return None;
        }
        let (x1, y1) = self.start_pos?;
        let (x2, y2) = self.current_pos?;
        Some((x1, y1, x2, y2))
    }

    /// Get the target node currently hovered during arrow drag.
    pub fn preview_target(&self) -> Option<NodeId> {
        if self.drawing { self.target_node } else { None }
    }
}

impl Tool for ArrowTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Arrow
    }

    fn handle(&mut self, event: &InputEvent, hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        use fd_core::model::{ArrowKind, CurveKind, Edge, Style};

        match event {
            InputEvent::PointerDown { x, y, .. } => {
                self.drawing = true;
                self.start_pos = Some((*x, *y));
                self.current_pos = Some((*x, *y));
                self.source_node = hit_node;
                vec![]
            }
            InputEvent::PointerMove { x, y, .. } => {
                if self.drawing {
                    self.current_pos = Some((*x, *y));
                    self.target_node = hit_node;
                }
                vec![]
            }
            InputEvent::PointerUp { x, y, .. } => {
                self.drawing = false;
                let source = self.source_node.take();
                let start = self.start_pos.take();
                self.current_pos = None;

                let target = hit_node;

                // Determine anchor endpoints
                let from_anchor = match source {
                    Some(id) => EdgeAnchor::Node(id),
                    None => {
                        if let Some((sx, sy)) = start {
                            EdgeAnchor::Point(sx, sy)
                        } else {
                            return vec![];
                        }
                    }
                };
                let to_anchor = match target {
                    Some(id) => EdgeAnchor::Node(id),
                    None => EdgeAnchor::Point(*x, *y),
                };

                // Prevent self-loops
                if let (EdgeAnchor::Node(a), EdgeAnchor::Node(b)) = (&from_anchor, &to_anchor)
                    && a == b
                {
                    return vec![];
                }

                // Require minimum drag distance (10px) for standalone arrows
                let (sx, sy) = start.unwrap_or(match &from_anchor {
                    EdgeAnchor::Point(px, py) => (*px, *py),
                    _ => (0.0, 0.0),
                });
                let dist = ((x - sx).powi(2) + (y - sy).powi(2)).sqrt();
                if dist < 10.0 {
                    return vec![];
                }

                let edge_id = NodeId::with_prefix("edge");
                let edge = Edge {
                    id: edge_id,
                    from: from_anchor,
                    to: to_anchor,
                    text_child: None,
                    style: Style::default(),
                    use_styles: Default::default(),
                    arrow: ArrowKind::End,
                    curve: CurveKind::Smooth,
                    annotations: Vec::new(),
                    animations: Default::default(),
                    flow: None,
                    label_offset: None,
                };
                vec![GraphMutation::AddEdge {
                    edge: Box::new(edge),
                }]
            }
            _ => vec![],
        }
    }
}

// ─── Eraser Tool ─────────────────────────────────────────────────────────

/// Eraser tool — swipe to delete nodes on touch.
///
/// Nodes are removed from the graph IMMEDIATELY during pointermove
/// (instant visual feedback). The tool tracks erased IDs so the
/// WASM layer can group them into a single undo entry on pointerup.
pub struct EraserTool {
    /// IDs erased during the current gesture (for undo grouping).
    pub erased_ids: Vec<NodeId>,
    /// Whether a drag gesture is active.
    pub dragging: bool,
}

impl Default for EraserTool {
    fn default() -> Self {
        Self::new()
    }
}

impl EraserTool {
    pub fn new() -> Self {
        Self {
            erased_ids: Vec::new(),
            dragging: false,
        }
    }

    /// Reset all eraser state (called between gestures or on tool switch).
    pub fn clear(&mut self) {
        self.erased_ids.clear();
        self.dragging = false;
    }
}

impl Tool for EraserTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Eraser
    }

    /// Returns empty mutations — FdCanvas manages the delete flow directly
    /// (needs access to the graph for group-aware detach).
    /// The tool is a thin state tracker for drag lifecycle.
    fn handle(&mut self, event: &InputEvent, _hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown { .. } => {
                self.erased_ids.clear();
                self.dragging = true;
                vec![]
            }
            InputEvent::PointerMove { .. } => vec![],
            InputEvent::PointerUp { .. } => {
                self.dragging = false;
                vec![]
            }
            _ => vec![],
        }
    }
}

#[cfg(test)]
#[path = "tools_tests.rs"]
mod tests;
