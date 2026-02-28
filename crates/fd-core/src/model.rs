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

/// Helper to parse a single hex digit.
pub fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

impl Color {
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
        const HEX_CHARS: &[u8; 16] = b"0123456789ABCDEF";
        let r = (self.r * 255.0).round() as u8;
        let g = (self.g * 255.0).round() as u8;
        let b = (self.b * 255.0).round() as u8;
        let a = (self.a * 255.0).round() as u8;

        if a == 255 {
            let buf = [
                b'#',
                HEX_CHARS[(r >> 4) as usize],
                HEX_CHARS[(r & 0xF) as usize],
                HEX_CHARS[(g >> 4) as usize],
                HEX_CHARS[(g & 0xF) as usize],
                HEX_CHARS[(b >> 4) as usize],
                HEX_CHARS[(b & 0xF) as usize],
            ];
            // SAFETY: buffer only contains valid ASCII hex characters and '#'
            unsafe { String::from_utf8_unchecked(buf.to_vec()) }
        } else {
            let buf = [
                b'#',
                HEX_CHARS[(r >> 4) as usize],
                HEX_CHARS[(r & 0xF) as usize],
                HEX_CHARS[(g >> 4) as usize],
                HEX_CHARS[(g & 0xF) as usize],
                HEX_CHARS[(b >> 4) as usize],
                HEX_CHARS[(b & 0xF) as usize],
                HEX_CHARS[(a >> 4) as usize],
                HEX_CHARS[(a & 0xF) as usize],
            ];
            // SAFETY: buffer only contains valid ASCII hex characters and '#'
            unsafe { String::from_utf8_unchecked(buf.to_vec()) }
        }
    }
}

/// A gradient stop.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradientStop {
    pub offset: f32, // 0.0 .. 1.0
    pub color: Color,
}

/// Fill or stroke paint.
#[derive(Debug, Clone, Serialize, Deserialize)]
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

/// A reusable theme set that nodes can reference via `use: theme_name`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Style {
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
/// Parsed from `spec { ... }` blocks in the FD format.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Annotation {
    /// Freeform description: `spec { "User auth entry point" }`
    Description(String),
    /// Acceptance criterion: `spec { accept: "validates email on blur" }`
    Accept(String),
    /// Status: `spec { status: todo }` (values: todo, doing, done, blocked)
    Status(String),
    /// Priority: `spec { priority: high }`
    Priority(String),
    /// Tag: `spec { tag: auth }`
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

/// A visual connection between two nodes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub id: NodeId,
    pub from: NodeId,
    pub to: NodeId,
    pub label: Option<String>,
    pub style: Style,
    pub use_styles: SmallVec<[NodeId; 2]>,
    pub arrow: ArrowKind,
    pub curve: CurveKind,
    pub annotations: Vec<Annotation>,
    pub animations: SmallVec<[AnimKeyframe; 2]>,
    pub flow: Option<FlowAnim>,
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
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub enum LayoutMode {
    /// Free / absolute positioning of children.
    #[default]
    Free,
    /// Column (vertical stack).
    Column { gap: f32, pad: f32 },
    /// Row (horizontal stack).
    Row { gap: f32, pad: f32 },
    /// Grid layout.
    Grid { cols: u32, gap: f32, pad: f32 },
}

// ─── Scene Graph Nodes ───────────────────────────────────────────────────

/// The node kinds in the scene DAG.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NodeKind {
    /// Root of the document.
    Root,

    /// Generic placeholder — no visual shape assigned yet.
    /// Used for spec-only nodes: `@login_btn { spec "CTA" }`
    Generic,

    /// Group / frame — contains children.
    Group { layout: LayoutMode },

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

    /// Text label.
    Text { content: String },
}

/// A single node in the scene graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneNode {
    /// The node's ID (e.g. `@login_form`). Anonymous nodes get auto-IDs.
    pub id: NodeId,

    /// What kind of element this is.
    pub kind: NodeKind,

    /// Inline style overrides on this node.
    pub style: Style,

    /// Named theme references (`use: base_text`).
    pub use_styles: SmallVec<[NodeId; 2]>,

    /// Constraint-based positioning.
    pub constraints: SmallVec<[Constraint; 2]>,

    /// Animations attached to this node.
    pub animations: SmallVec<[AnimKeyframe; 2]>,

    /// Structured annotations (`spec { ... }` block).
    pub annotations: Vec<Annotation>,

    /// Line comments (`# text`) that appeared before this node in the source.
    /// Preserved across parse/emit round-trips so format passes don't delete them.
    pub comments: Vec<String>,
}

impl SceneNode {
    pub fn new(id: NodeId, kind: NodeKind) -> Self {
        Self {
            id,
            kind,
            style: Style::default(),
            use_styles: SmallVec::new(),
            constraints: SmallVec::new(),
            animations: SmallVec::new(),
            annotations: Vec::new(),
            comments: Vec::new(),
        }
    }
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

    /// Named theme definitions (`theme base_text { ... }`).
    pub styles: HashMap<NodeId, Style>,

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
        true
    }

    /// Define a named style.
    pub fn define_style(&mut self, name: NodeId, style: Style) {
        self.styles.insert(name, style);
    }

    /// Resolve a node's effective style (merging `use` references + inline overrides + active animations).
    pub fn resolve_style(&self, node: &SceneNode, active_triggers: &[AnimTrigger]) -> Style {
        let mut resolved = Style::default();

        // Apply referenced styles in order
        for style_id in &node.use_styles {
            if let Some(base) = self.styles.get(style_id) {
                merge_style(&mut resolved, base);
            }
        }

        // Apply inline overrides (take precedence)
        merge_style(&mut resolved, &node.style);

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
    pub fn resolve_style_for_edge(&self, edge: &Edge, active_triggers: &[AnimTrigger]) -> Style {
        let mut resolved = Style::default();
        for style_id in &edge.use_styles {
            if let Some(base) = self.styles.get(style_id) {
                merge_style(&mut resolved, base);
            }
        }
        merge_style(&mut resolved, &edge.style);

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

    /// Return the leaf node directly — children are always selectable first.
    /// Groups can still be selected by clicking their own area (not covered by children)
    /// or via marquee selection.
    pub fn effective_target(&self, leaf_id: NodeId, _selected: &[NodeId]) -> NodeId {
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
fn merge_style(dst: &mut Style, src: &Style) {
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
#[derive(Debug, Clone, Copy, Default)]
pub struct ResolvedBounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl ResolvedBounds {
    pub fn contains(&self, px: f32, py: f32) -> bool {
        px >= self.x && px <= self.x + self.width && py >= self.y && py <= self.y + self.height
    }

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
            Style {
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
            },
        );
        node.use_styles.push(NodeId::intern("base"));
        node.style.font = Some(FontSpec {
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
            Style {
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
            },
        );
        node.use_styles.push(NodeId::intern("centered"));
        node.style.text_align = Some(TextAlign::Right);

        let resolved = sg.resolve_style(&node, &[]);
        // Horizontal should be overridden to Right
        assert_eq!(resolved.text_align, Some(TextAlign::Right));
        // Vertical should come from base style (Middle)
        assert_eq!(resolved.text_valign, Some(TextVAlign::Middle));
    }

    #[test]
    fn test_effective_target_returns_leaf() {
        let mut sg = SceneGraph::new();

        // Root -> Group -> Rect
        let group_id = NodeId::intern("my_group");
        let rect_id = NodeId::intern("my_rect");

        let group = SceneNode::new(
            group_id,
            NodeKind::Group {
                layout: LayoutMode::Free,
            },
        );
        let rect = SceneNode::new(
            rect_id,
            NodeKind::Rect {
                width: 10.0,
                height: 10.0,
            },
        );

        let group_idx = sg.add_node(sg.root, group);
        sg.add_node(group_idx, rect);

        // Always returns leaf directly, regardless of selection state
        assert_eq!(sg.effective_target(rect_id, &[]), rect_id);
        assert_eq!(sg.effective_target(rect_id, &[group_id]), rect_id);
        assert_eq!(sg.effective_target(rect_id, &[rect_id]), rect_id);
    }

    #[test]
    fn test_effective_target_nested_returns_leaf() {
        let mut sg = SceneGraph::new();

        // Root -> group_outer -> group_inner -> rect_leaf
        let outer_id = NodeId::intern("group_outer");
        let inner_id = NodeId::intern("group_inner");
        let leaf_id = NodeId::intern("rect_leaf");

        let outer = SceneNode::new(
            outer_id,
            NodeKind::Group {
                layout: LayoutMode::Free,
            },
        );
        let inner = SceneNode::new(
            inner_id,
            NodeKind::Group {
                layout: LayoutMode::Free,
            },
        );
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

        // Always returns leaf directly, regardless of selection state
        assert_eq!(sg.effective_target(leaf_id, &[]), leaf_id);
        assert_eq!(sg.effective_target(leaf_id, &[outer_id]), leaf_id);
        assert_eq!(sg.effective_target(leaf_id, &[outer_id, inner_id]), leaf_id);
    }

    #[test]
    fn test_is_ancestor_of() {
        let mut sg = SceneGraph::new();

        // Root -> Group -> Rect
        let group_id = NodeId::intern("grp");
        let rect_id = NodeId::intern("r1");
        let other_id = NodeId::intern("other");

        let group = SceneNode::new(
            group_id,
            NodeKind::Group {
                layout: LayoutMode::Free,
            },
        );
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
        node.style.fill = Some(Paint::Solid(Color::rgba(1.0, 0.0, 0.0, 1.0)));
        node.animations.push(AnimKeyframe {
            trigger: AnimTrigger::Press,
            duration_ms: 100,
            easing: Easing::EaseOut,
            properties: AnimProperties {
                scale: Some(0.97),
                ..Default::default()
            },
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
}
