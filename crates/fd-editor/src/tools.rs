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
//! Click-without-drag creates a shape with default size (162×100 rect, 140×140 ellipse).

use crate::input::InputEvent;
use crate::sync::GraphMutation;
use fd_core::id::NodeId;
use fd_core::model::*;

/// The active tool determines how input events are interpreted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolKind {
    Select,
    Hand,
    Rect,
    Ellipse,
    Pen,
    Text,
    Arrow,
    Frame,
    Eraser,
    Lasso,
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
    EdgeStart,
    EdgeEnd,
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
    pub dragging: bool,
    pub last_x: f32,
    pub last_y: f32,
    /// Node ID deferred for Shift+click toggle-deselect on PointerUp.
    /// When Shift+clicking an already-selected node, we defer the deselect
    /// to PointerUp so Shift+drag can constrain the axis without losing
    /// the clicked node from the selection.
    pub shift_toggled_off: Option<NodeId>,
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
    /// Original aspect ratio at resize start (w/h) for Shift+resize.
    resize_aspect: f32,
    /// Target node currently hovered during edge handle drag (for snapping/ghosting).
    pub target_node: Option<NodeId>,
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
            shift_toggled_off: None,
            marquee_start: None,
            marquee_rect: None,
            resize_handle: None,
            resize_origin: (0.0, 0.0, 0.0, 0.0),
            resize_anchor: (0.0, 0.0),
            resize_aspect: 1.0,
            target_node: None,
        }
    }

    /// Start a resize interaction on a specific handle.
    /// Called by FdCanvas when pointer-down hits a handle.
    pub fn start_resize(&mut self, handle: ResizeHandle, bounds: (f32, f32, f32, f32)) {
        let (x, y, w, h) = bounds;
        self.resize_handle = Some(handle);
        self.resize_origin = bounds;
        self.resize_aspect = w / h.max(0.001);
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
            ResizeHandle::EdgeStart | ResizeHandle::EdgeEnd => (0.0, 0.0),
        };
    }

    /// Get the first selected node.
    pub fn first_selected(&self) -> Option<NodeId> {
        self.selected.first().copied()
    }

    /// Get the target node currently hovered during edge handle drag (snap target).
    pub fn preview_target(&self) -> Option<NodeId> {
        self.target_node
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
                self.target_node = None;

                // If resize_handle is set (by FdCanvas), skip normal selection
                if self.resize_handle.is_some() {
                    return vec![];
                }

                if let Some(hit_id) = hit_node {
                    // Shift+click: toggle node in/out of selection.
                    // If clicking an already-selected node with Shift, DEFER
                    // the deselect to PointerUp so Shift+drag can constrain
                    // the axis without losing this node from the selection.
                    self.shift_toggled_off = None;
                    let multi_select = modifiers.shift
                        || (modifiers.meta && !modifiers.alt)
                        || (modifiers.ctrl && !modifiers.alt);
                    if multi_select {
                        if self.selected.contains(&hit_id) {
                            // Defer deselect — will fire on PointerUp if no drag
                            self.shift_toggled_off = Some(hit_id);
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

                    // Alt+click duplication is handled by FdCanvas (not here)
                    // so that selection can transfer to the clone properly.

                    vec![]
                } else {
                    // Click on empty space: start marquee
                    if !(modifiers.shift || modifiers.meta || modifiers.ctrl) {
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
                    if matches!(handle, ResizeHandle::EdgeStart | ResizeHandle::EdgeEnd) {
                        use fd_core::model::EdgeAnchor;
                        let mx = *x;
                        let my = *y;

                        // Prevent self-snapping to the edge itself
                        let snap_id = hit_node.filter(|&n| n != id);
                        self.target_node = snap_id;

                        let anchor = match snap_id {
                            Some(sn) => EdgeAnchor::Node(sn),
                            None => EdgeAnchor::Point(mx, my),
                        };

                        let (from, to) = match handle {
                            ResizeHandle::EdgeStart => (Some(anchor), None),
                            ResizeHandle::EdgeEnd => (None, Some(anchor)),
                            _ => (None, None),
                        };
                        return vec![crate::sync::GraphMutation::UpdateEdge { id, from, to }];
                    }

                    let (ax, ay) = self.resize_anchor;
                    let mut mx = *x;
                    let mut my = *y;

                    // Shift: preserve original aspect ratio
                    if modifiers.shift {
                        let aspect = self.resize_aspect;
                        let dw = (mx - ax).abs();
                        let dh = (my - ay).abs();
                        if dw / aspect.max(0.001) >= dh {
                            // Width-dominant: compute height from aspect
                            let new_h = dw / aspect.max(0.001);
                            my = if my > ay { ay + new_h } else { ay - new_h };
                        } else {
                            // Height-dominant: compute width from aspect
                            let new_w = dh * aspect;
                            mx = if mx > ax { ax + new_w } else { ax - new_w };
                        }
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
                        ResizeHandle::EdgeStart | ResizeHandle::EdgeEnd => unreachable!(),
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
                        ResizeHandle::EdgeStart | ResizeHandle::EdgeEnd => unreachable!(),
                    };

                    // Min size
                    let final_w = new_w.max(4.0);
                    let final_h = new_h.max(4.0);

                    // Compute position delta from original
                    let dx = new_x - self.resize_origin.0;
                    let dy = new_y - self.resize_origin.1;
                    self.resize_origin = (new_x, new_y, final_w, final_h);

                    return vec![GraphMutation::ResizeNode {
                        id,
                        width: final_w,
                        height: final_h,
                        dx,
                        dy,
                    }];
                }

                // Marquee drag
                if let Some((sx, sy)) = self.marquee_start {
                    self.marquee_rect = Some(Self::normalize_rect(sx, sy, *x, *y));
                    // Return empty — no graph mutation, but FdCanvas will re-render
                    return vec![];
                }

                // Node drag
                if self.dragging && !self.selected.is_empty() {
                    // Alt mid-drag duplication is handled by FdCanvas (not here)
                    // so that selection can transfer to the clone properly.

                    // Shift: per-frame axis-snap — project movement onto the
                    // dominant axis (H or V). Allows switching axes mid-drag
                    // by changing direction. No diagonal movement.
                    if modifiers.shift {
                        let dx = x - self.last_x;
                        let dy = y - self.last_y;

                        // Snap to dominant axis
                        let (dx, dy) = if dx.abs() >= dy.abs() {
                            (dx, 0.0)
                        } else {
                            (0.0, dy)
                        };

                        // Only cancel deferred Shift deselect if we actually moved
                        if dx.abs() > 0.5 || dy.abs() > 0.5 {
                            self.shift_toggled_off = None;
                        }

                        self.last_x += dx;
                        self.last_y += dy;

                        // Cmd/Ctrl during drag = move children too
                        let with_children = modifiers.meta || modifiers.ctrl;

                        return self
                            .selected
                            .iter()
                            .map(|id| GraphMutation::MoveNode {
                                id: *id,
                                dx,
                                dy,
                                with_children,
                            })
                            .collect();
                    }

                    let dx = x - self.last_x;
                    let dy = y - self.last_y;
                    self.last_x = *x;
                    self.last_y = *y;

                    // Cmd/Ctrl during drag = move children too
                    let with_children = modifiers.meta || modifiers.ctrl;

                    // Move all selected nodes
                    return self
                        .selected
                        .iter()
                        .map(|id| GraphMutation::MoveNode {
                            id: *id,
                            dx,
                            dy,
                            with_children,
                        })
                        .collect();
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                self.target_node = None;
                // Marquee end is handled by FdCanvas (it calls hit_test_rect)
                // Deferred Shift+click deselect: if the user Shift+clicked
                // an already-selected node but didn't drag, deselect it now.
                if let Some(toggle_id) = self.shift_toggled_off.take()
                    && let Some(pos) = self.selected.iter().position(|id| *id == toggle_id)
                {
                    self.selected.remove(pos);
                }
                self.dragging = false;
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
    /// When true, creates `NodeKind::Frame` instead of `NodeKind::Rect`.
    /// Set by `FdCanvas` based on `active_tool == ToolKind::Frame`.
    pub frame_mode: bool,
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
            frame_mode: false,
        }
    }

    /// Whether a draw gesture is in progress.
    pub fn is_drawing(&self) -> bool {
        self.drawing
    }

    /// The ID of the shape currently being drawn (if any).
    pub fn current_drawing_id(&self) -> Option<NodeId> {
        self.current_id
    }

    /// Cancel the current draw gesture (reset state).
    pub fn cancel(&mut self) {
        self.drawing = false;
        self.dragged = false;
        self.current_id = None;
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

                let (id, kind) = if self.frame_mode {
                    (
                        NodeId::with_prefix("frame"),
                        NodeKind::Frame {
                            width: 0.0,
                            height: 0.0,
                            clip: true,
                            layout: LayoutMode::default(),
                        },
                    )
                } else {
                    (
                        NodeId::with_prefix("rect"),
                        NodeKind::Rect {
                            width: 0.0,
                            height: 0.0,
                        },
                    )
                };
                self.current_id = Some(id);

                let mut node = SceneNode::new(id, kind);
                node.constraints.push(Constraint::Position { x: *x, y: *y });
                if self.frame_mode {
                    // Frame defaults: light fill, thin stroke, no corner radius
                    node.props.fill = Some(Paint::Solid(Color::rgba(0.97, 0.97, 0.97, 1.0)));
                    node.props.stroke = Some(Stroke {
                        paint: Paint::Solid(Color::rgba(0.7, 0.7, 0.7, 1.0)),
                        width: 1.0,
                        cap: StrokeCap::Butt,
                        join: StrokeJoin::Miter,
                    });
                } else {
                    // Rect defaults: transparent fill + dark stroke
                    node.props.stroke = Some(Stroke {
                        paint: Paint::Solid(Color::rgba(0.2, 0.2, 0.2, 1.0)),
                        width: 2.5,
                        cap: StrokeCap::Round,
                        join: StrokeJoin::Round,
                    });
                    node.props.corner_radius = Some(8.0);
                }
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

                    // Drag-back-to-cancel: if cursor returns within 5px of
                    // start, reset dragged so PointerUp produces click-to-place.
                    let dist_sq = (x - self.start_x).powi(2) + (y - self.start_y).powi(2);
                    if dist_sq < 25.0 {
                        self.dragged = false;
                    }

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
                        return vec![GraphMutation::ResizeNode {
                            id,
                            width: w,
                            height: h,
                            dx,
                            dy,
                        }];
                    }

                    // Reposition origin to top-left corner so drawing
                    // works in all directions (north, west, etc.).
                    // Use constrained dimensions for origin when Shift is held,
                    // so the origin reflects the square constraint.
                    let origin_x = if *x < self.start_x {
                        self.start_x - w
                    } else {
                        self.start_x
                    };
                    let origin_y = if *y < self.start_y {
                        self.start_y - h
                    } else {
                        self.start_y
                    };
                    let dx = origin_x - self.last_cx;
                    let dy = origin_y - self.last_cy;
                    self.last_cx = origin_x;
                    self.last_cy = origin_y;

                    return vec![GraphMutation::ResizeNode {
                        id,
                        width: w,
                        height: h,
                        dx,
                        dy,
                    }];
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                self.drawing = false;
                if !self.dragged {
                    if let Some(id) = self.current_id.take() {
                        // Click without drag → default 162×100 centered at click point
                        let w = 162.0_f32;
                        let h = 100.0_f32;
                        vec![GraphMutation::ResizeNode {
                            id,
                            width: w,
                            height: h,
                            dx: -w / 2.0,
                            dy: -h / 2.0,
                        }]
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
    /// Points with pressure: (x, y, pressure 0.0–1.0).
    points: Vec<(f32, f32, f32)>,
    current_id: Option<NodeId>,
    /// Parent node for new path nodes (default: root).
    parent_id: NodeId,
    start_x: f32,
    start_y: f32,
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
            parent_id: NodeId::intern("root"),
            start_x: 0.0,
            start_y: 0.0,
        }
    }

    /// Whether a draw gesture is in progress.
    pub fn is_drawing(&self) -> bool {
        self.drawing
    }

    /// Set the parent node for new path nodes.
    /// Paths will be created as children of this node.
    pub fn set_parent(&mut self, id: NodeId) {
        self.parent_id = id;
    }

    /// Cancel the current draw gesture (reset state).
    pub fn cancel(&mut self) {
        self.drawing = false;
        self.points.clear();
        self.current_id = None;
    }
}

impl Tool for PenTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Pen
    }

    fn handle(&mut self, event: &InputEvent, _hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown { x, y, pressure, .. } => {
                self.drawing = true;
                self.points.clear();
                self.start_x = *x;
                self.start_y = *y;
                self.points.push((0.0, 0.0, *pressure));
                let id = NodeId::with_prefix("path");
                self.current_id = Some(id);

                let path = NodeKind::Path {
                    commands: vec![PathCmd::MoveTo(0.0, 0.0)],
                };
                let mut node = SceneNode::new(id, path);
                node.constraints.push(Constraint::Position { x: *x, y: *y });
                // Default stroke for pen — will be updated on PointerUp with pressure
                node.props.stroke = Some(Stroke {
                    paint: Paint::Solid(Color::rgba(0.37, 0.36, 0.90, 1.0)),
                    width: 2.5,
                    cap: StrokeCap::Round,
                    join: StrokeJoin::Round,
                });
                vec![GraphMutation::AddNode {
                    parent_id: self.parent_id,
                    node: Box::new(node),
                }]
            }
            InputEvent::PointerMove { x, y, pressure, .. } => {
                if self.drawing
                    && let Some(id) = self.current_id
                {
                    self.points
                        .push((*x - self.start_x, *y - self.start_y, *pressure));
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
                    let stroke_width = pressure_to_stroke_width(&self.points);

                    let mut min_x = f32::MAX;
                    let mut min_y = f32::MAX;
                    for p in &self.points {
                        min_x = min_x.min(p.0);
                        min_y = min_y.min(p.1);
                    }

                    if min_x != f32::MAX {
                        for p in &mut self.points {
                            p.0 -= min_x;
                            p.1 -= min_y;
                        }
                    } else {
                        min_x = 0.0;
                        min_y = 0.0;
                    }

                    let cmds = points_to_smooth_bezier(&self.points);
                    self.points.clear();
                    return vec![
                        GraphMutation::UpdatePath { id, commands: cmds },
                        GraphMutation::SetStrokeWidth {
                            id,
                            width: stroke_width,
                        },
                        GraphMutation::SetConstraints {
                            id,
                            constraints: vec![Constraint::Position {
                                x: self.start_x + min_x,
                                y: self.start_y + min_y,
                            }],
                        },
                    ];
                }
                self.points.clear();
                vec![]
            }
            _ => vec![],
        }
    }
}

// ─── Path smoothing helpers ───────────────────────────────────────────────

/// Compute stroke width from average pressure across all points.
/// Light pressure (≤0.3) → thin (1.0px), heavy pressure (≥0.9) → thick (4.5px).
fn pressure_to_stroke_width(points: &[(f32, f32, f32)]) -> f32 {
    if points.is_empty() {
        return 2.5;
    }
    let avg_pressure: f32 = points.iter().map(|p| p.2).sum::<f32>() / points.len() as f32;
    // Map pressure [0.0, 1.0] → stroke width [1.0, 4.5]
    let min_width = 1.0_f32;
    let max_width = 4.5_f32;
    min_width + (max_width - min_width) * avg_pressure.clamp(0.0, 1.0)
}

/// Build a simple MoveTo + LineTo chain from raw points (used during live drawing).
fn raw_points_to_lineto(points: &[(f32, f32, f32)]) -> Vec<PathCmd> {
    if points.is_empty() {
        return vec![];
    }
    let mut cmds = Vec::with_capacity(points.len());
    cmds.push(PathCmd::MoveTo(points[0].0, points[0].1));
    for &(x, y, _) in points.iter().skip(1) {
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
fn points_to_smooth_bezier(points: &[(f32, f32, f32)]) -> Vec<PathCmd> {
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
fn subsample_points(pts: &[(f32, f32, f32)], max_pts: usize) -> Vec<(f32, f32, f32)> {
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

    /// Whether a draw gesture is in progress.
    pub fn is_drawing(&self) -> bool {
        self.drawing
    }

    /// The ID of the shape currently being drawn (if any).
    pub fn current_drawing_id(&self) -> Option<NodeId> {
        self.current_id
    }

    /// Cancel the current draw gesture (reset state).
    pub fn cancel(&mut self) {
        self.drawing = false;
        self.dragged = false;
        self.current_id = None;
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
                // Transparent fill + dark stroke (matching create_node_at defaults)
                node.props.stroke = Some(Stroke {
                    paint: Paint::Solid(Color::rgba(0.2, 0.2, 0.2, 1.0)),
                    width: 2.5,
                    cap: StrokeCap::Round,
                    join: StrokeJoin::Round,
                });
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

                    // Drag-back-to-cancel: if cursor returns within 5px of
                    // start, reset dragged so PointerUp produces click-to-place.
                    let dist_sq = (x - self.start_x).powi(2) + (y - self.start_y).powi(2);
                    if dist_sq < 25.0 {
                        self.dragged = false;
                    }

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
                        return vec![GraphMutation::ResizeNode {
                            id,
                            width: w,
                            height: h,
                            dx,
                            dy,
                        }];
                    }

                    // Reposition origin to top-left corner so drawing
                    // works in all directions (north, west, etc.).
                    // Use constrained dimensions for origin when Shift is held,
                    // so the origin reflects the circle constraint.
                    let origin_x = if *x < self.start_x {
                        self.start_x - w
                    } else {
                        self.start_x
                    };
                    let origin_y = if *y < self.start_y {
                        self.start_y - h
                    } else {
                        self.start_y
                    };
                    let dx = origin_x - self.last_cx;
                    let dy = origin_y - self.last_cy;
                    self.last_cx = origin_x;
                    self.last_cy = origin_y;

                    return vec![GraphMutation::ResizeNode {
                        id,
                        width: w,
                        height: h,
                        dx,
                        dy,
                    }];
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                self.drawing = false;
                if !self.dragged {
                    if let Some(id) = self.current_id.take() {
                        // Click without drag → default 128×128 centered at click point
                        let w = 128.0_f32;
                        let h = 128.0_f32;
                        vec![GraphMutation::ResizeNode {
                            id,
                            width: w,
                            height: h,
                            dx: -w / 2.0,
                            dy: -h / 2.0,
                        }]
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
                        max_width: None,
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
    pub start_pos: Option<(f32, f32)>,
    /// Source node the arrow originates from.
    pub source_node: Option<NodeId>,
    /// Current drag position for live preview.
    pub current_pos: Option<(f32, f32)>,
    /// Target node currently hovered during arrow drag.
    pub target_node: Option<NodeId>,
    /// Whether a drag is in progress.
    pub drawing: bool,
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
        use fd_core::model::{ArrowKind, CurveKind, Edge, Properties};

        match event {
            InputEvent::PointerDown { x, y, .. } => {
                self.drawing = true;
                self.start_pos = Some((*x, *y));
                self.current_pos = Some((*x, *y));
                self.source_node = hit_node;
                vec![]
            }
            InputEvent::PointerMove {
                x, y, modifiers, ..
            } => {
                if self.drawing {
                    let (sx, sy) = self.start_pos.unwrap_or((*x, *y));
                    let (fx, fy) = if modifiers.shift {
                        snap_to_45_degrees(sx, sy, *x, *y)
                    } else {
                        (*x, *y)
                    };
                    self.current_pos = Some((fx, fy));
                    self.target_node = hit_node;
                }
                vec![]
            }
            InputEvent::PointerUp {
                x, y, modifiers, ..
            } => {
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
                    None => {
                        // Shift: snap endpoint to nearest 45° from start
                        let (fx, fy) = if modifiers.shift {
                            let (sx, sy) = match &from_anchor {
                                EdgeAnchor::Point(px, py) => (*px, *py),
                                _ => start.unwrap_or((*x, *y)),
                            };
                            snap_to_45_degrees(sx, sy, *x, *y)
                        } else {
                            (*x, *y)
                        };
                        EdgeAnchor::Point(fx, fy)
                    }
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
                let mut props = Properties::default();
                if let Some(color) = Color::from_hex("#6B7080") {
                    props.stroke = Some(Stroke {
                        paint: Paint::Solid(color),
                        width: 2.0,
                        cap: StrokeCap::Round,
                        join: StrokeJoin::Round,
                    });
                }

                let edge = Edge {
                    id: edge_id,
                    from: from_anchor,
                    to: to_anchor,
                    text_child: None,
                    props,
                    use_styles: Default::default(),
                    arrow: ArrowKind::End,
                    curve: CurveKind::Smooth,
                    spec: None,
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

// ─── Arrow angle snap helper ─────────────────────────────────────────────

/// Snap a point to the nearest 45° direction from a start point.
///
/// Projects `(end_x, end_y)` onto one of 8 directions:
/// 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°.
/// Returns the snapped `(x, y)` at the same distance from start.
fn snap_to_45_degrees(start_x: f32, start_y: f32, end_x: f32, end_y: f32) -> (f32, f32) {
    let dx = end_x - start_x;
    let dy = end_y - start_y;
    let dist = (dx * dx + dy * dy).sqrt();
    if dist < 0.001 {
        return (end_x, end_y);
    }
    let angle = dy.atan2(dx);
    // Round to nearest 45° (π/4)
    let snap_angle = (angle / core::f32::consts::FRAC_PI_4).round() * core::f32::consts::FRAC_PI_4;
    let snapped_x = start_x + dist * snap_angle.cos();
    let snapped_y = start_y + dist * snap_angle.sin();
    (snapped_x, snapped_y)
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

// ─── Lasso Tool ──────────────────────────────────────────────────────────

/// Lasso (freehand polygon) selection tool.
///
/// Draw a polygon around nodes to select all whose bounding box centers
/// fall inside the polygon. Uses ray-casting for point-in-polygon testing.
pub struct LassoTool {
    /// Polygon vertices collected during drag.
    pub polygon: Vec<(f32, f32)>,
    /// Whether a lasso gesture is active.
    pub active: bool,
}

impl Default for LassoTool {
    fn default() -> Self {
        Self::new()
    }
}

impl LassoTool {
    pub fn new() -> Self {
        Self {
            polygon: Vec::new(),
            active: false,
        }
    }

    /// Clear all lasso state.
    pub fn clear(&mut self) {
        self.polygon.clear();
        self.active = false;
    }

    /// Test if a point is inside the lasso polygon using ray-casting.
    pub fn contains_point(&self, px: f32, py: f32) -> bool {
        point_in_polygon(px, py, &self.polygon)
    }
}

impl Tool for LassoTool {
    fn kind(&self) -> ToolKind {
        ToolKind::Lasso
    }

    /// Returns empty mutations — FdCanvas manages multi-select from
    /// the completed polygon. The tool tracks polygon state only.
    fn handle(&mut self, event: &InputEvent, _hit_node: Option<NodeId>) -> Vec<GraphMutation> {
        match event {
            InputEvent::PointerDown { x, y, .. } => {
                self.polygon.clear();
                self.polygon.push((*x, *y));
                self.active = true;
                vec![]
            }
            InputEvent::PointerMove { x, y, .. } => {
                if self.active {
                    // Subsample: skip if < 3px from last point
                    if let Some(&(lx, ly)) = self.polygon.last() {
                        let dist_sq = (x - lx).powi(2) + (y - ly).powi(2);
                        if dist_sq >= 9.0 {
                            self.polygon.push((*x, *y));
                        }
                    }
                }
                vec![]
            }
            InputEvent::PointerUp { .. } => {
                self.active = false;
                // Polygon stays populated for FdCanvas to query
                vec![]
            }
            _ => vec![],
        }
    }
}

/// Ray-casting algorithm for point-in-polygon test.
///
/// Casts a horizontal ray from (px, py) to +∞ and counts edge crossings.
/// Odd count = inside.
fn point_in_polygon(px: f32, py: f32, polygon: &[(f32, f32)]) -> bool {
    if polygon.len() < 3 {
        return false;
    }
    let mut inside = false;
    let n = polygon.len();
    let mut j = n - 1;
    for i in 0..n {
        let (xi, yi) = polygon[i];
        let (xj, yj) = polygon[j];
        if ((yi > py) != (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    inside
}

#[cfg(test)]
#[path = "tools_tests.rs"]
mod tests;
