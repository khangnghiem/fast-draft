//! Core scene-graph data model for FD documents.
//!
//! The document is a DAG (Directed Acyclic Graph) where nodes represent
//! visual elements (shapes, text, groups) and edges represent parent→child
//! containment. Styles and animations are attached to nodes. Layout is
//! constraint-based — relationships are preferred over raw positions.
//! `Position { x, y }` is the escape hatch for drag-placed or pinned nodes.

use crate::id::NodeId;
use petgraph::graph::NodeIndex;
use petgraph::stable_graph::StableDiGraph;
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use std::collections::HashMap;

// ─── Colors & Paint ──────────────────────────────────────────────────────

/// RGBA color. Stored as 4 × f32 [0.0, 1.0].
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

/// Compile-time lookup table for fast hex character parsing.
/// Maps ASCII bytes to their 0-15 hex value, or 255 if invalid.
/// This avoids branching (match statement) in the hot parsing path.
const HEX_LUT: [u8; 256] = {
    let mut lut = [255; 256];
    let mut i = 0;
    while i < 10 {
        lut[(b'0' + i) as usize] = i;
        i += 1;
    }
    let mut i = 0;
    while i < 6 {
        lut[(b'a' + i) as usize] = i + 10;
        lut[(b'A' + i) as usize] = i + 10;
        i += 1;
    }
    lut
};

/// Helper to parse a single hex digit.
#[inline(always)]
pub fn hex_val(c: u8) -> Option<u8> {
    let val = HEX_LUT[c as usize];
    if val != 255 { Some(val) } else { None }
}

impl Color {
    /// Create a new color from RGBA components.
    pub const fn rgba(r: f32, g: f32, b: f32, a: f32) -> Self {
        Self { r, g, b, a }
    }

    /// Parse a hex color string: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`.
    /// The string may optionally start with `#`.
    pub fn from_hex(hex: &str) -> Option<Self> {
        let hex = hex.strip_prefix('#').unwrap_or(hex);
        let bytes = hex.as_bytes();

        match bytes.len() {
            3 => {
                let r = hex_val(bytes[0])?;
                let g = hex_val(bytes[1])?;
                let b = hex_val(bytes[2])?;
                Some(Self::rgba(
                    (r * 17) as f32 / 255.0,
                    (g * 17) as f32 / 255.0,
                    (b * 17) as f32 / 255.0,
                    1.0,
                ))
            }
            4 => {
                let r = hex_val(bytes[0])?;
                let g = hex_val(bytes[1])?;
                let b = hex_val(bytes[2])?;
                let a = hex_val(bytes[3])?;
                Some(Self::rgba(
                    (r * 17) as f32 / 255.0,
                    (g * 17) as f32 / 255.0,
                    (b * 17) as f32 / 255.0,
                    (a * 17) as f32 / 255.0,
                ))
            }
            6 => {
                let r = hex_val(bytes[0])? << 4 | hex_val(bytes[1])?;
                let g = hex_val(bytes[2])? << 4 | hex_val(bytes[3])?;
                let b = hex_val(bytes[4])? << 4 | hex_val(bytes[5])?;
                Some(Self::rgba(
                    r as f32 / 255.0,
                    g as f32 / 255.0,
                    b as f32 / 255.0,
                    1.0,
                ))
            }
            8 => {
                let r = hex_val(bytes[0])? << 4 | hex_val(bytes[1])?;
                let g = hex_val(bytes[2])? << 4 | hex_val(bytes[3])?;
                let b = hex_val(bytes[4])? << 4 | hex_val(bytes[5])?;
                let a = hex_val(bytes[6])? << 4 | hex_val(bytes[7])?;
                Some(Self::rgba(
                    r as f32 / 255.0,
                    g as f32 / 255.0,
                    b as f32 / 255.0,
                    a as f32 / 255.0,
                ))
            }
            _ => None,
        }
    }

    /// Emit as shortest valid hex string.
    pub fn to_hex(&self) -> String {
        let r = (self.r * 255.0).round() as u8;
        let g = (self.g * 255.0).round() as u8;
        let b = (self.b * 255.0).round() as u8;
        let a = (self.a * 255.0).round() as u8;
        if a == 255 {
            format!("#{r:02X}{g:02X}{b:02X}")
        } else {
            format!("#{r:02X}{g:02X}{b:02X}{a:02X}")
        }
    }
}

/// A gradient stop.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GradientStop {
    pub offset: f32, // 0.0 .. 1.0
    pub color: Color,
}

/// Fill or stroke paint.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Paint {
    Solid(Color),
    LinearGradient {
        angle: f32, // degrees
        stops: Vec<GradientStop>,
    },
    RadialGradient {
        stops: Vec<GradientStop>,
    },
}

// ─── Stroke ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stroke {
    pub paint: Paint,
    pub width: f32,
    pub cap: StrokeCap,
    pub join: StrokeJoin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StrokeCap {
    Butt,
    Round,
    Square,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StrokeJoin {
    Miter,
    Round,
    Bevel,
}

impl Default for Stroke {
    fn default() -> Self {
        Self {
            paint: Paint::Solid(Color::rgba(0.0, 0.0, 0.0, 1.0)),
            width: 1.0,
            cap: StrokeCap::Butt,
            join: StrokeJoin::Miter,
        }
    }
}

// ─── Font / Text ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontSpec {
    pub family: String,
    pub weight: u16, // 100..900
    pub size: f32,
}

impl Default for FontSpec {
    fn default() -> Self {
        Self {
            family: "Inter".into(),
            weight: 400,
            size: 14.0,
        }
    }
}

// ─── Path data ───────────────────────────────────────────────────────────

/// A single path command (SVG-like but simplified).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PathCmd {
    MoveTo(f32, f32),
    LineTo(f32, f32),
    QuadTo(f32, f32, f32, f32),            // control, end
    CubicTo(f32, f32, f32, f32, f32, f32), // c1, c2, end
    Close,
}

// ─── Image data ──────────────────────────────────────────────────────────

/// Source for an embedded image.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImageSource {
    /// Relative file path: `src: "assets/hero.png"`.
    File(String),
}

/// How an image fits within its declared dimensions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum ImageFit {
    /// Scale to cover bounds, crop overflow.
    #[default]
    Cover,
    /// Scale to fit within bounds, letterbox.
    Contain,
    /// Stretch to exact dimensions.
    Fill,
    /// Natural size, no scaling.
    None,
}

// ─── Shadow ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shadow {
    pub offset_x: f32,
    pub offset_y: f32,
    pub blur: f32,
    pub color: Color,
}

// ─── Styling ─────────────────────────────────────────────────────────────

/// Horizontal text alignment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum TextAlign {
    Left,
    #[default]
    Center,
    Right,
}

/// Vertical text alignment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum TextVAlign {
    Top,
    #[default]
    Middle,
    Bottom,
}

/// Horizontal placement of a child within its parent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum HPlace {
    Left,
    #[default]
    Center,
    Right,
}

/// Vertical placement of a child within its parent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum VPlace {
    Top,
    #[default]
    Middle,
    Bottom,
}

/// A reusable style set that nodes can reference via `use: style_name`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Properties {
    pub fill: Option<Paint>,
    pub stroke: Option<Stroke>,
    pub font: Option<FontSpec>,
    pub corner_radius: Option<f32>,
    pub opacity: Option<f32>,
    pub shadow: Option<Shadow>,

    /// Horizontal text alignment (default: Center).
    pub text_align: Option<TextAlign>,
    /// Vertical text alignment (default: Middle).
    pub text_valign: Option<TextVAlign>,

    /// Scale factor applied during rendering (from animations).
    pub scale: Option<f32>,
}

// ─── Animation ───────────────────────────────────────────────────────────

/// The trigger for an animation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnimTrigger {
    Hover,
    Press,
    Enter, // viewport enter
    Custom(String),
}

/// Easing function.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Easing {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    Spring,
    CubicBezier(f32, f32, f32, f32),
}

/// A property animation keyframe.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimKeyframe {
    pub trigger: AnimTrigger,
    pub duration_ms: u32,
    pub easing: Easing,
    pub properties: AnimProperties,
    /// Optional post-revert cooldown (ms) before re-triggerable.
    /// `None` = no cooldown (default).
    pub delay_ms: Option<u32>,
}

/// Animatable property overrides.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AnimProperties {
    pub fill: Option<Paint>,
    pub opacity: Option<f32>,
    pub scale: Option<f32>,
    pub rotate: Option<f32>, // degrees
    pub translate: Option<(f32, f32)>,
}

// ─── Annotations ─────────────────────────────────────────────────────────

/// Structured annotation attached to a scene node.
/// Parsed from `note { ... }` blocks in the FD format.
/// Also accepts the legacy `spec { ... }` keyword for backward compatibility.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Annotation {
    /// Freeform description: `note { "User auth entry point" }`
    Description(String),
    /// To-do / acceptance criterion: `note { todo: "validates email on blur" }`
    /// Also accepts the legacy `accept:` keyword.
    Accept(String),
    /// Status: `note { status: todo }` (values: todo, doing, done, blocked)
    Status(String),
    /// Priority: `note { priority: high }`
    Priority(String),
    /// Tag: `note { tag: auth }`
    Tag(String),
}

// ─── Imports ─────────────────────────────────────────────────────────────

/// A file import declaration: `import "path.fd" as namespace`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Import {
    /// Relative file path, e.g. "components/buttons.fd".
    pub path: String,
    /// Namespace alias, e.g. "buttons".
    pub namespace: String,
}

// ─── Layout Constraints ──────────────────────────────────────────────────

/// Constraint-based layout — no absolute coordinates in the format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Constraint {
    /// Center this node within a target (e.g. `canvas` or another node).
    CenterIn(NodeId),
    /// Position relative: dx, dy from a reference node.
    Offset { from: NodeId, dx: f32, dy: f32 },
    /// Fill the parent with optional padding.
    FillParent { pad: f32 },
    /// Parent-relative position (used for drag-placed or pinned nodes).
    /// Resolved as `parent.x + x`, `parent.y + y` by the layout solver.
    Position { x: f32, y: f32 },
}

// ─── Edges (connections between nodes) ───────────────────────────────────

/// Arrow head placement on an edge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum ArrowKind {
    #[default]
    None,
    Start,
    End,
    Both,
}

/// How the edge path is drawn between two nodes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum CurveKind {
    #[default]
    Straight,
    Smooth,
    Step,
}

/// An edge endpoint — either connected to a node or a free point in scene-space.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum EdgeAnchor {
    /// Connected to a node center.
    Node(NodeId),
    /// Fixed position in scene-space (standalone arrow).
    Point(f32, f32),
}

impl EdgeAnchor {
    /// Return the NodeId if this is a Node anchor.
    pub fn node_id(&self) -> Option<NodeId> {
        match self {
            Self::Node(id) => Some(*id),
            Self::Point(_, _) => None,
        }
    }
}

/// Document-level default styles for edges.
///
/// When an `edge_defaults` block is present, individual edges omit
/// properties that match the defaults — saving tokens for documents
/// with many similarly styled edges.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EdgeDefaults {
    pub props: Properties,
    pub arrow: Option<ArrowKind>,
    pub curve: Option<CurveKind>,
}

/// A visual connection between two endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub id: NodeId,
    pub from: EdgeAnchor,
    pub to: EdgeAnchor,
    /// Optional text child node (max 1). The node lives in the SceneGraph.
    pub text_child: Option<NodeId>,
    pub props: Properties,
    pub use_styles: SmallVec<[NodeId; 2]>,
    pub arrow: ArrowKind,
    pub curve: CurveKind,
    pub annotations: Vec<Annotation>,
    pub animations: SmallVec<[AnimKeyframe; 2]>,
    pub flow: Option<FlowAnim>,
    /// Offset of the edge text from the midpoint, set when label is dragged.
    pub label_offset: Option<(f32, f32)>,
}

/// Flow animation kind — continuous motion along the edge path.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FlowKind {
    /// A glowing dot traveling from → to on a loop.
    Pulse,
    /// Marching dashes along the edge (stroke-dashoffset animation).
    Dash,
}

/// A flow animation attached to an edge.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct FlowAnim {
    pub kind: FlowKind,
    pub duration_ms: u32,
}

/// Group layout mode (for children arrangement).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LayoutMode {
    /// Free / absolute positioning of children.
    /// Optional padding insets the content area (default 0).
    Free { pad: f32 },
    /// Column (vertical stack).
    Column { gap: f32, pad: f32 },
    /// Row (horizontal stack).
    Row { gap: f32, pad: f32 },
    /// Grid layout.
    Grid { cols: u32, gap: f32, pad: f32 },
}

impl Default for LayoutMode {
    fn default() -> Self {
        LayoutMode::Free { pad: 0.0 }
    }
}

// ─── Scene Graph Nodes ───────────────────────────────────────────────────

/// The node kinds in the scene DAG.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NodeKind {
    /// Root of the document.
    Root,

    /// Generic placeholder — no visual shape assigned yet.
    /// Used for note-only nodes: `@login_btn { note "CTA" }`
    Generic,

    /// Organizational container (like Figma Group).
    /// Auto-sizes to children, no own styles or layout modes.
    Group,

    /// Frame — visible container with explicit size and optional clipping.
    /// Like a Figma frame: has fill/stroke, declared dimensions, clips overflow.
    Frame {
        width: f32,
        height: f32,
        clip: bool,
        layout: LayoutMode,
    },

    /// Rectangle.
    Rect { width: f32, height: f32 },

    /// Ellipse / circle.
    Ellipse { rx: f32, ry: f32 },

    /// Freeform path (pen tool output).
    Path { commands: Vec<PathCmd> },

    /// Embedded image (R3.32).
    Image {
        source: ImageSource,
        width: f32,
        height: f32,
        fit: ImageFit,
    },

    /// Text label. Optional `max_width` constrains horizontal extent
    /// for word wrapping (set via resize handle drag).
    Text {
        content: String,
        max_width: Option<f32>,
    },
}

impl NodeKind {
    /// Return the FD format keyword for this node kind.
    pub fn kind_name(&self) -> &'static str {
        match self {
            Self::Root => "root",
            Self::Generic => "generic",
            Self::Group => "group",
            Self::Frame { .. } => "frame",
            Self::Rect { .. } => "rect",
            Self::Ellipse { .. } => "ellipse",
            Self::Path { .. } => "path",
            Self::Image { .. } => "image",
            Self::Text { .. } => "text",
        }
    }
}

/// A single node in the scene graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneNode {
    /// The node's ID (e.g. `@login_form`). Anonymous nodes get auto-IDs.
    pub id: NodeId,

    /// What kind of element this is.
    pub kind: NodeKind,

    /// Inline style overrides on this node.
    pub props: Properties,

    /// Named style references (`use: base_text`).
    pub use_styles: SmallVec<[NodeId; 2]>,

    /// Constraint-based positioning.
    pub constraints: SmallVec<[Constraint; 2]>,

    /// Animations attached to this node.
    pub animations: SmallVec<[AnimKeyframe; 2]>,

    /// Structured annotations (`note { ... }` block, also accepts legacy `spec`).
    pub annotations: Vec<Annotation>,

    /// Line comments (`# text`) that appeared before this node in the source.
    /// Preserved across parse/emit round-trips so format passes don't delete them.
    pub comments: Vec<String>,

    /// 9-position placement of this child within its parent.
    /// `None` = default positioning (auto-center for text, origin for others).
    pub place: Option<(HPlace, VPlace)>,

    /// Whether this node is locked (prevents move, resize, delete on canvas).
    /// Parsed from `locked: true` in the FD format.
    pub locked: bool,
}

impl SceneNode {
    /// Create a new SceneNode with a given ID and kind.
    pub fn new(id: NodeId, kind: NodeKind) -> Self {
        Self {
            id,
            kind,
            props: Properties::default(),
            use_styles: SmallVec::new(),
            constraints: SmallVec::new(),
            animations: SmallVec::new(),
            annotations: Vec::new(),
            comments: Vec::new(),
            place: None,
            locked: false,
        }
    }
}

// ─── Graph Snapshot (for ReadMode::Diff) ─────────────────────────────────

/// A lightweight snapshot of graph state for diff computation.
///
/// Stores per-node and per-edge hashes so that changes can be detected
/// by comparing hashes rather than storing full copies of the graph.
#[derive(Debug, Clone, Default)]
pub struct GraphSnapshot {
    /// Hash of each node's emitted text, keyed by NodeId.
    pub node_hashes: HashMap<NodeId, u64>,
    /// Hash of each edge's emitted text, keyed by edge id.
    pub edge_hashes: HashMap<NodeId, u64>,
}

// ─── Scene Graph ─────────────────────────────────────────────────────────

/// The complete FD document — a DAG of `SceneNode` values.
///
/// Edges go from parent → child. Style definitions are stored separately
/// in a hashmap for lookup by name.
#[derive(Debug, Clone)]
pub struct SceneGraph {
    /// The underlying directed graph.
    pub graph: StableDiGraph<SceneNode, ()>,

    /// The root node index.
    pub root: NodeIndex,

    /// Named style definitions (`style base_text { ... }`).
    pub styles: HashMap<NodeId, Properties>,

    /// Index from NodeId → NodeIndex for fast lookup.
    pub id_index: HashMap<NodeId, NodeIndex>,

    /// Visual edges (connections between nodes).
    pub edges: Vec<Edge>,

    /// File imports with namespace aliases.
    pub imports: Vec<Import>,

    /// Explicit child ordering set by `sort_nodes`.
    /// When present for a parent, `children()` returns this order
    /// instead of the default `NodeIndex` sort.
    pub sorted_child_order: HashMap<NodeIndex, Vec<NodeIndex>>,

    /// Document-level default styles for edges.
    /// When present, individual edge properties matching the defaults are omitted.
    pub edge_defaults: Option<EdgeDefaults>,
}

impl SceneGraph {
    /// Create a new empty scene graph with a root node.
    #[must_use]
    pub fn new() -> Self {
        let mut graph = StableDiGraph::new();
        let root_node = SceneNode::new(NodeId::intern("root"), NodeKind::Root);
        let root = graph.add_node(root_node);

        let mut id_index = HashMap::new();
        id_index.insert(NodeId::intern("root"), root);

        Self {
            graph,
            root,
            styles: HashMap::new(),
            id_index,
            edges: Vec::new(),
            imports: Vec::new(),
            sorted_child_order: HashMap::new(),
            edge_defaults: None,
        }
    }

    /// Add a node as a child of `parent`. Returns the new node's index.
    pub fn add_node(&mut self, parent: NodeIndex, node: SceneNode) -> NodeIndex {
        let id = node.id;
        let idx = self.graph.add_node(node);
        self.graph.add_edge(parent, idx, ());
        self.id_index.insert(id, idx);
        idx
    }

    /// Remove a node safely, keeping the `id_index` synchronized.
    pub fn remove_node(&mut self, idx: NodeIndex) -> Option<SceneNode> {
        let removed = self.graph.remove_node(idx);
        if let Some(removed_node) = &removed {
            self.id_index.remove(&removed_node.id);
        }
        removed
    }

    /// Look up a node by its `@id`.
    pub fn get_by_id(&self, id: NodeId) -> Option<&SceneNode> {
        self.id_index.get(&id).map(|idx| &self.graph[*idx])
    }

    /// Look up a node mutably by its `@id`.
    pub fn get_by_id_mut(&mut self, id: NodeId) -> Option<&mut SceneNode> {
        self.id_index
            .get(&id)
            .copied()
            .map(|idx| &mut self.graph[idx])
    }

    /// Get the index for a NodeId.
    pub fn index_of(&self, id: NodeId) -> Option<NodeIndex> {
        self.id_index.get(&id).copied()
    }

    /// Get the parent index of a node.
    pub fn parent(&self, idx: NodeIndex) -> Option<NodeIndex> {
        self.graph
            .neighbors_directed(idx, petgraph::Direction::Incoming)
            .next()
    }

    /// Reparent a node to a new parent.
    pub fn reparent_node(&mut self, child: NodeIndex, new_parent: NodeIndex) {
        if let Some(old_parent) = self.parent(child)
            && let Some(edge) = self.graph.find_edge(old_parent, child)
        {
            self.graph.remove_edge(edge);
        }
        self.graph.add_edge(new_parent, child, ());
    }

    /// Get children of a node in document (insertion) order.
    ///
    /// Sorts by `NodeIndex` so the result is deterministic regardless of
    /// how `petgraph` iterates its adjacency list on different targets
    /// (native vs WASM).
    pub fn children(&self, idx: NodeIndex) -> Vec<NodeIndex> {
        // If an explicit sort order was set (by sort_nodes), use it
        if let Some(order) = self.sorted_child_order.get(&idx) {
            return order.clone();
        }

        let mut children: Vec<NodeIndex> = self
            .graph
            .neighbors_directed(idx, petgraph::Direction::Outgoing)
            .collect();
        children.sort();
        children
    }

    /// Move a child one step backward in z-order (swap with previous sibling).
    /// Returns true if the z-order changed.
    pub fn send_backward(&mut self, child: NodeIndex) -> bool {
        let parent = match self.parent(child) {
            Some(p) => p,
            None => return false,
        };
        let siblings = self.children(parent);
        let pos = match siblings.iter().position(|&s| s == child) {
            Some(p) => p,
            None => return false,
        };
        if pos == 0 {
            return false; // already at back
        }
        // Rebuild edges in swapped order
        self.rebuild_child_order(parent, &siblings, pos, pos - 1)
    }

    /// Move a child one step forward in z-order (swap with next sibling).
    /// Returns true if the z-order changed.
    pub fn bring_forward(&mut self, child: NodeIndex) -> bool {
        let parent = match self.parent(child) {
            Some(p) => p,
            None => return false,
        };
        let siblings = self.children(parent);
        let pos = match siblings.iter().position(|&s| s == child) {
            Some(p) => p,
            None => return false,
        };
        if pos >= siblings.len() - 1 {
            return false; // already at front
        }
        self.rebuild_child_order(parent, &siblings, pos, pos + 1)
    }

    /// Move a child to the back of z-order (first child).
    pub fn send_to_back(&mut self, child: NodeIndex) -> bool {
        let parent = match self.parent(child) {
            Some(p) => p,
            None => return false,
        };
        let siblings = self.children(parent);
        let pos = match siblings.iter().position(|&s| s == child) {
            Some(p) => p,
            None => return false,
        };
        if pos == 0 {
            return false;
        }
        self.rebuild_child_order(parent, &siblings, pos, 0)
    }

    /// Move a child to the front of z-order (last child).
    pub fn bring_to_front(&mut self, child: NodeIndex) -> bool {
        let parent = match self.parent(child) {
            Some(p) => p,
            None => return false,
        };
        let siblings = self.children(parent);
        let pos = match siblings.iter().position(|&s| s == child) {
            Some(p) => p,
            None => return false,
        };
        let last = siblings.len() - 1;
        if pos == last {
            return false;
        }
        self.rebuild_child_order(parent, &siblings, pos, last)
    }

    /// Rebuild child edges, moving child at `from` to `to` position.
    fn rebuild_child_order(
        &mut self,
        parent: NodeIndex,
        siblings: &[NodeIndex],
        from: usize,
        to: usize,
    ) -> bool {
        // Remove all edges from parent to children
        for &sib in siblings {
            if let Some(edge) = self.graph.find_edge(parent, sib) {
                self.graph.remove_edge(edge);
            }
        }
        // Build new order
        let mut new_order: Vec<NodeIndex> = siblings.to_vec();
        let child = new_order.remove(from);
        new_order.insert(to, child);
        // Re-add edges in new order
        for &sib in &new_order {
            self.graph.add_edge(parent, sib, ());
        }
        // Store explicit child order so children() returns z-order, not NodeIndex order
        self.sorted_child_order.insert(parent, new_order);
        true
    }

    /// Define a named style.
    pub fn define_style(&mut self, name: NodeId, style: Properties) {
        self.styles.insert(name, style);
    }

    /// Resolve a node's effective style (merging `use` references + inline overrides + active animations).
    pub fn resolve_style(&self, node: &SceneNode, active_triggers: &[AnimTrigger]) -> Properties {
        let mut resolved = Properties::default();

        // Apply referenced styles in order
        for style_id in &node.use_styles {
            if let Some(base) = self.styles.get(style_id) {
                merge_style(&mut resolved, base);
            }
        }

        // Apply inline overrides (take precedence)
        merge_style(&mut resolved, &node.props);

        // Apply active animation state overrides
        for anim in &node.animations {
            if active_triggers.contains(&anim.trigger) {
                if anim.properties.fill.is_some() {
                    resolved.fill = anim.properties.fill.clone();
                }
                if anim.properties.opacity.is_some() {
                    resolved.opacity = anim.properties.opacity;
                }
                if anim.properties.scale.is_some() {
                    resolved.scale = anim.properties.scale;
                }
            }
        }

        resolved
    }

    /// Rebuild the `id_index` (needed after deserialization).
    pub fn rebuild_index(&mut self) {
        self.id_index.clear();
        for idx in self.graph.node_indices() {
            let id = self.graph[idx].id;
            self.id_index.insert(id, idx);
        }
    }

    /// Resolve an edge's effective style (merging `use` references + inline overrides + active animations).
    pub fn resolve_style_for_edge(
        &self,
        edge: &Edge,
        active_triggers: &[AnimTrigger],
    ) -> Properties {
        let mut resolved = Properties::default();
        for style_id in &edge.use_styles {
            if let Some(base) = self.styles.get(style_id) {
                merge_style(&mut resolved, base);
            }
        }
        merge_style(&mut resolved, &edge.props);

        for anim in &edge.animations {
            if active_triggers.contains(&anim.trigger) {
                if anim.properties.fill.is_some() {
                    resolved.fill = anim.properties.fill.clone();
                }
                if anim.properties.opacity.is_some() {
                    resolved.opacity = anim.properties.opacity;
                }
                if anim.properties.scale.is_some() {
                    resolved.scale = anim.properties.scale;
                }
            }
        }

        resolved
    }

    /// Resolve the effective click target for a leaf node.
    ///
    /// Figma-style group selection with progressive drill-down:
    /// - **First click** → selects the topmost group ancestor (below root).
    /// - **Click again** (topmost group already selected) → next-level group.
    /// - **Click again** (all group ancestors selected) → the leaf itself.
    pub fn effective_target(&self, leaf_id: NodeId, selected: &[NodeId]) -> NodeId {
        let leaf_idx = match self.index_of(leaf_id) {
            Some(idx) => idx,
            None => return leaf_id,
        };

        // Walk up from the leaf, collecting group ancestors below root
        // in bottom-up order.
        let mut groups_bottom_up: Vec<NodeId> = Vec::new();
        let mut cursor = self.parent(leaf_idx);
        while let Some(parent_idx) = cursor {
            if parent_idx == self.root {
                break;
            }
            if matches!(self.graph[parent_idx].kind, NodeKind::Group) {
                groups_bottom_up.push(self.graph[parent_idx].id);
            }
            cursor = self.parent(parent_idx);
        }

        // Reverse to get top-down order (topmost group first).
        groups_bottom_up.reverse();

        // Find the deepest selected group in the ancestor chain.
        // If a selected node is in the chain, advance to the next level down.
        let deepest_selected_pos = groups_bottom_up
            .iter()
            .rposition(|gid| selected.contains(gid));

        match deepest_selected_pos {
            None => {
                // Nothing in the chain is selected → return topmost group
                if let Some(top) = groups_bottom_up.first() {
                    return *top;
                }
            }
            Some(pos) if pos + 1 < groups_bottom_up.len() => {
                // Selected group is not the deepest → advance one level
                return groups_bottom_up[pos + 1];
            }
            Some(_) => {
                // Deepest group is already selected → drill to leaf
            }
        }

        leaf_id
    }

    /// Check if `ancestor_id` is a parent/grandparent/etc. of `descendant_id`.
    pub fn is_ancestor_of(&self, ancestor_id: NodeId, descendant_id: NodeId) -> bool {
        if ancestor_id == descendant_id {
            return false;
        }
        let mut current_idx = match self.index_of(descendant_id) {
            Some(idx) => idx,
            None => return false,
        };
        while let Some(parent_idx) = self.parent(current_idx) {
            if self.graph[parent_idx].id == ancestor_id {
                return true;
            }
            if matches!(self.graph[parent_idx].kind, NodeKind::Root) {
                break;
            }
            current_idx = parent_idx;
        }
        false
    }
}

impl Default for SceneGraph {
    fn default() -> Self {
        Self::new()
    }
}

/// Merge `src` style into `dst`, overwriting only `Some` fields.
fn merge_style(dst: &mut Properties, src: &Properties) {
    if src.fill.is_some() {
        dst.fill = src.fill.clone();
    }
    if src.stroke.is_some() {
        dst.stroke = src.stroke.clone();
    }
    if src.font.is_some() {
        dst.font = src.font.clone();
    }
    if src.corner_radius.is_some() {
        dst.corner_radius = src.corner_radius;
    }
    if src.opacity.is_some() {
        dst.opacity = src.opacity;
    }
    if src.shadow.is_some() {
        dst.shadow = src.shadow.clone();
    }

    if src.text_align.is_some() {
        dst.text_align = src.text_align;
    }
    if src.text_valign.is_some() {
        dst.text_valign = src.text_valign;
    }
    if src.scale.is_some() {
        dst.scale = src.scale;
    }
}

// ─── Resolved positions (output of layout solver) ────────────────────────

/// Resolved absolute bounding box after constraint solving.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ResolvedBounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl ResolvedBounds {
    /// Check if a point (px, py) is inside these bounds.
    pub fn contains(&self, px: f32, py: f32) -> bool {
        px >= self.x && px <= self.x + self.width && py >= self.y && py <= self.y + self.height
    }

    /// Return the center point of these bounds.
    pub fn center(&self) -> (f32, f32) {
        (self.x + self.width / 2.0, self.y + self.height / 2.0)
    }

    /// Check if this bounds intersects with a rectangle (AABB overlap).
    pub fn intersects_rect(&self, rx: f32, ry: f32, rw: f32, rh: f32) -> bool {
        self.x < rx + rw
            && self.x + self.width > rx
            && self.y < ry + rh
            && self.y + self.height > ry
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_graph_basics() {
        let mut sg = SceneGraph::new();
        let rect = SceneNode::new(
            NodeId::intern("box1"),
            NodeKind::Rect {
                width: 100.0,
                height: 50.0,
            },
        );
        let idx = sg.add_node(sg.root, rect);

        assert!(sg.get_by_id(NodeId::intern("box1")).is_some());
        assert_eq!(sg.children(sg.root).len(), 1);
        assert_eq!(sg.children(sg.root)[0], idx);
    }

    #[test]
    fn color_hex_roundtrip() {
        let c = Color::from_hex("#6C5CE7").unwrap();
        assert_eq!(c.to_hex(), "#6C5CE7");

        let c2 = Color::from_hex("#FF000080").unwrap();
        assert!((c2.a - 128.0 / 255.0).abs() < 0.01);
        assert!(c2.to_hex().len() == 9); // #RRGGBBAA
    }

    #[test]
    fn style_merging() {
        let mut sg = SceneGraph::new();
        sg.define_style(
            NodeId::intern("base"),
            Properties {
                fill: Some(Paint::Solid(Color::rgba(0.0, 0.0, 0.0, 1.0))),
                font: Some(FontSpec {
                    family: "Inter".into(),
                    weight: 400,
                    size: 14.0,
                }),
                ..Default::default()
            },
        );

        let mut node = SceneNode::new(
            NodeId::intern("txt"),
            NodeKind::Text {
                content: "hi".into(),
                max_width: None,
            },
        );
        node.use_styles.push(NodeId::intern("base"));
        node.props.font = Some(FontSpec {
            family: "Inter".into(),
            weight: 700,
            size: 24.0,
        });

        let resolved = sg.resolve_style(&node, &[]);
        // Fill comes from base style
        assert!(resolved.fill.is_some());
        // Font comes from inline override
        let f = resolved.font.unwrap();
        assert_eq!(f.weight, 700);
        assert_eq!(f.size, 24.0);
    }

    #[test]
    fn style_merging_align() {
        let mut sg = SceneGraph::new();
        sg.define_style(
            NodeId::intern("centered"),
            Properties {
                text_align: Some(TextAlign::Center),
                text_valign: Some(TextVAlign::Middle),
                ..Default::default()
            },
        );

        // Node with use: centered + inline override of text_align to Right
        let mut node = SceneNode::new(
            NodeId::intern("overridden"),
            NodeKind::Text {
                content: "hello".into(),
                max_width: None,
            },
        );
        node.use_styles.push(NodeId::intern("centered"));
        node.props.text_align = Some(TextAlign::Right);

        let resolved = sg.resolve_style(&node, &[]);
        // Horizontal should be overridden to Right
        assert_eq!(resolved.text_align, Some(TextAlign::Right));
        // Vertical should come from base style (Middle)
        assert_eq!(resolved.text_valign, Some(TextVAlign::Middle));
    }

    #[test]
    fn test_effective_target_group_selects_group_first() {
        let mut sg = SceneGraph::new();

        // Root -> Group -> Rect
        let group_id = NodeId::intern("my_group");
        let rect_id = NodeId::intern("my_rect");

        let group = SceneNode::new(group_id, NodeKind::Group);
        let rect = SceneNode::new(
            rect_id,
            NodeKind::Rect {
                width: 10.0,
                height: 10.0,
            },
        );

        let group_idx = sg.add_node(sg.root, group);
        sg.add_node(group_idx, rect);

        // Single click (nothing selected): should select the group
        assert_eq!(sg.effective_target(rect_id, &[]), group_id);
        // Double click (group already selected): drill down to leaf
        assert_eq!(sg.effective_target(rect_id, &[group_id]), rect_id);
        // Group itself → returns group (it IS the leaf in this call)
        assert_eq!(sg.effective_target(group_id, &[]), group_id);
    }

    #[test]
    fn test_effective_target_nested_groups_selects_topmost() {
        let mut sg = SceneGraph::new();

        // Root -> group_outer -> group_inner -> rect_leaf
        let outer_id = NodeId::intern("group_outer");
        let inner_id = NodeId::intern("group_inner");
        let leaf_id = NodeId::intern("rect_leaf");

        let outer = SceneNode::new(outer_id, NodeKind::Group);
        let inner = SceneNode::new(inner_id, NodeKind::Group);
        let leaf = SceneNode::new(
            leaf_id,
            NodeKind::Rect {
                width: 50.0,
                height: 50.0,
            },
        );

        let outer_idx = sg.add_node(sg.root, outer);
        let inner_idx = sg.add_node(outer_idx, inner);
        sg.add_node(inner_idx, leaf);

        // Single click (nothing selected): topmost group
        assert_eq!(sg.effective_target(leaf_id, &[]), outer_id);
        // Outer selected → drill to inner group
        assert_eq!(sg.effective_target(leaf_id, &[outer_id]), inner_id);
        // Both outer+inner selected → drill to leaf
        assert_eq!(sg.effective_target(leaf_id, &[outer_id, inner_id]), leaf_id);
        // Non-cumulative: only inner selected (SelectTool replaces, not accumulates)
        // Must drill to leaf — NOT loop back to outer
        assert_eq!(sg.effective_target(leaf_id, &[inner_id]), leaf_id);
    }

    #[test]
    fn test_effective_target_nested_drill_down_three_levels() {
        let mut sg = SceneGraph::new();

        // Root -> group_a -> group_b -> group_c -> rect_leaf
        let a_id = NodeId::intern("group_a");
        let b_id = NodeId::intern("group_b");
        let c_id = NodeId::intern("group_c");
        let leaf_id = NodeId::intern("deep_leaf");

        let a = SceneNode::new(a_id, NodeKind::Group);
        let b = SceneNode::new(b_id, NodeKind::Group);
        let c = SceneNode::new(c_id, NodeKind::Group);
        let leaf = SceneNode::new(
            leaf_id,
            NodeKind::Rect {
                width: 10.0,
                height: 10.0,
            },
        );

        let a_idx = sg.add_node(sg.root, a);
        let b_idx = sg.add_node(a_idx, b);
        let c_idx = sg.add_node(b_idx, c);
        sg.add_node(c_idx, leaf);

        // Progressive drill-down (non-cumulative — SelectTool replaces selection)
        assert_eq!(sg.effective_target(leaf_id, &[]), a_id);
        assert_eq!(sg.effective_target(leaf_id, &[a_id]), b_id);
        assert_eq!(sg.effective_target(leaf_id, &[b_id]), c_id);
        assert_eq!(sg.effective_target(leaf_id, &[c_id]), leaf_id);
    }

    #[test]
    fn test_visual_highlight_differs_from_selected() {
        // Visual highlight contract: when effective_target returns a group,
        // the UI should highlight the raw hit (leaf) not the group.
        let mut sg = SceneGraph::new();

        let group_id = NodeId::intern("card");
        let child_id = NodeId::intern("card_title");

        let group = SceneNode::new(group_id, NodeKind::Group);
        let child = SceneNode::new(
            child_id,
            NodeKind::Text {
                content: "Title".into(),
                max_width: None,
            },
        );

        let group_idx = sg.add_node(sg.root, group);
        sg.add_node(group_idx, child);

        // Raw hit = child_id, nothing selected
        let logical_target = sg.effective_target(child_id, &[]);
        // Logical selection should be the group
        assert_eq!(logical_target, group_id);
        // Visual highlight should be the child (raw hit != logical_target)
        assert_ne!(child_id, logical_target);
        // After drilling (group selected), both converge
        let drilled = sg.effective_target(child_id, &[group_id]);
        assert_eq!(drilled, child_id);
    }

    #[test]
    fn test_effective_target_no_group() {
        let mut sg = SceneGraph::new();

        // Root -> Rect (no group)
        let rect_id = NodeId::intern("standalone_rect");
        let rect = SceneNode::new(
            rect_id,
            NodeKind::Rect {
                width: 10.0,
                height: 10.0,
            },
        );
        sg.add_node(sg.root, rect);

        // No group parent → returns leaf directly
        assert_eq!(sg.effective_target(rect_id, &[]), rect_id);
    }

    #[test]
    fn test_is_ancestor_of() {
        let mut sg = SceneGraph::new();

        // Root -> Group -> Rect
        let group_id = NodeId::intern("grp");
        let rect_id = NodeId::intern("r1");
        let other_id = NodeId::intern("other");

        let group = SceneNode::new(group_id, NodeKind::Group);
        let rect = SceneNode::new(
            rect_id,
            NodeKind::Rect {
                width: 10.0,
                height: 10.0,
            },
        );
        let other = SceneNode::new(
            other_id,
            NodeKind::Rect {
                width: 5.0,
                height: 5.0,
            },
        );

        let group_idx = sg.add_node(sg.root, group);
        sg.add_node(group_idx, rect);
        sg.add_node(sg.root, other);

        // Group is ancestor of rect
        assert!(sg.is_ancestor_of(group_id, rect_id));
        // Root is ancestor of rect (grandparent)
        assert!(sg.is_ancestor_of(NodeId::intern("root"), rect_id));
        // Rect is NOT ancestor of group
        assert!(!sg.is_ancestor_of(rect_id, group_id));
        // Self is NOT ancestor of self
        assert!(!sg.is_ancestor_of(group_id, group_id));
        // Other is not ancestor of rect (sibling)
        assert!(!sg.is_ancestor_of(other_id, rect_id));
    }

    #[test]
    fn test_resolve_style_scale_animation() {
        let sg = SceneGraph::new();

        let mut node = SceneNode::new(
            NodeId::intern("btn"),
            NodeKind::Rect {
                width: 100.0,
                height: 40.0,
            },
        );
        node.props.fill = Some(Paint::Solid(Color::rgba(1.0, 0.0, 0.0, 1.0)));
        node.animations.push(AnimKeyframe {
            trigger: AnimTrigger::Press,
            duration_ms: 100,
            easing: Easing::EaseOut,
            properties: AnimProperties {
                scale: Some(0.97),
                ..Default::default()
            },
            delay_ms: None,
        });

        // Without press trigger: scale should be None
        let resolved = sg.resolve_style(&node, &[]);
        assert!(resolved.scale.is_none());

        // With press trigger: scale should be 0.97
        let resolved = sg.resolve_style(&node, &[AnimTrigger::Press]);
        assert_eq!(resolved.scale, Some(0.97));
        // Fill should still be present
        assert!(resolved.fill.is_some());
    }

    #[test]
    fn z_order_bring_forward() {
        let mut sg = SceneGraph::new();
        let a = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("a"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );
        let _b = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("b"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );
        let _c = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("c"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );

        // Initial: [a, b, c]
        let ids: Vec<&str> = sg
            .children(sg.root)
            .iter()
            .map(|&i| sg.graph[i].id.as_str())
            .collect();
        assert_eq!(ids, vec!["a", "b", "c"]);

        // Bring @a forward → should swap a and b → [b, a, c]
        let changed = sg.bring_forward(a);
        assert!(changed);
        let ids: Vec<&str> = sg
            .children(sg.root)
            .iter()
            .map(|&i| sg.graph[i].id.as_str())
            .collect();
        assert_eq!(ids, vec!["b", "a", "c"]);
    }

    #[test]
    fn z_order_send_backward() {
        let mut sg = SceneGraph::new();
        let _a = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("a"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );
        let _b = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("b"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );
        let c = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("c"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );

        // Send @c backward → should swap c and b → [a, c, b]
        let changed = sg.send_backward(c);
        assert!(changed);
        let ids: Vec<&str> = sg
            .children(sg.root)
            .iter()
            .map(|&i| sg.graph[i].id.as_str())
            .collect();
        assert_eq!(ids, vec!["a", "c", "b"]);
    }

    #[test]
    fn z_order_bring_to_front() {
        let mut sg = SceneGraph::new();
        let a = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("a"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );
        let _b = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("b"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );
        let _c = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("c"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );

        // Bring @a to front → [b, c, a]
        let changed = sg.bring_to_front(a);
        assert!(changed);
        let ids: Vec<&str> = sg
            .children(sg.root)
            .iter()
            .map(|&i| sg.graph[i].id.as_str())
            .collect();
        assert_eq!(ids, vec!["b", "c", "a"]);
    }

    #[test]
    fn z_order_send_to_back() {
        let mut sg = SceneGraph::new();
        let _a = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("a"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );
        let _b = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("b"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );
        let c = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("c"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );

        // Send @c to back → [c, a, b]
        let changed = sg.send_to_back(c);
        assert!(changed);
        let ids: Vec<&str> = sg
            .children(sg.root)
            .iter()
            .map(|&i| sg.graph[i].id.as_str())
            .collect();
        assert_eq!(ids, vec!["c", "a", "b"]);
    }

    #[test]
    fn z_order_emitter_roundtrip() {
        use crate::emitter::emit_document;
        use crate::parser::parse_document;

        let mut sg = SceneGraph::new();
        let a = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("a"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );
        let _b = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("b"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );
        let _c = sg.add_node(
            sg.root,
            SceneNode::new(
                NodeId::intern("c"),
                NodeKind::Rect {
                    width: 50.0,
                    height: 50.0,
                },
            ),
        );

        // Bring @a to front → [b, c, a]
        sg.bring_to_front(a);

        // Emit and re-parse
        let text = emit_document(&sg);
        let reparsed = parse_document(&text).unwrap();
        let ids: Vec<&str> = reparsed
            .children(reparsed.root)
            .iter()
            .map(|&i| reparsed.graph[i].id.as_str())
            .collect();
        assert_eq!(
            ids,
            vec!["b", "c", "a"],
            "Z-order should survive emit→parse roundtrip. Emitted:\n{}",
            text
        );
    }
}
