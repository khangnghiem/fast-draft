//! Core scene-graph data model for FD documents.
//!
//! The document is a DAG (Directed Acyclic Graph) where nodes represent
//! visual elements (shapes, text, groups) and edges represent parent→child
//! containment. Styles and animations are attached to nodes. Layout is
//! constraint-based — no absolute coordinates are stored in the format.

use crate::id::NodeId;
use petgraph::graph::{DiGraph, NodeIndex};
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

impl Color {
    pub const fn rgba(r: f32, g: f32, b: f32, a: f32) -> Self {
        Self { r, g, b, a }
    }

    /// Parse a hex color string: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`.
    pub fn from_hex(hex: &str) -> Option<Self> {
        let hex = hex.strip_prefix('#')?;
        match hex.len() {
            3 => {
                let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?;
                let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?;
                let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?;
                Some(Self::rgba(
                    r as f32 / 255.0,
                    g as f32 / 255.0,
                    b as f32 / 255.0,
                    1.0,
                ))
            }
            4 => {
                let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?;
                let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?;
                let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?;
                let a = u8::from_str_radix(&hex[3..4].repeat(2), 16).ok()?;
                Some(Self::rgba(
                    r as f32 / 255.0,
                    g as f32 / 255.0,
                    b as f32 / 255.0,
                    a as f32 / 255.0,
                ))
            }
            6 => {
                let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
                let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
                let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
                Some(Self::rgba(
                    r as f32 / 255.0,
                    g as f32 / 255.0,
                    b as f32 / 255.0,
                    1.0,
                ))
            }
            8 => {
                let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
                let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
                let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
                let a = u8::from_str_radix(&hex[6..8], 16).ok()?;
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

/// A reusable style set that nodes can reference via `use: style_name`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Style {
    pub fill: Option<Paint>,
    pub stroke: Option<Stroke>,
    pub font: Option<FontSpec>,
    pub corner_radius: Option<f32>,
    pub opacity: Option<f32>,
    pub shadow: Option<Shadow>,
    /// Optional label text rendered centered inside the shape (for rect/ellipse).
    pub label: Option<String>,
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
/// Parsed from `##` lines in the FD format.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Annotation {
    /// Freeform description: `## "User auth entry point"`
    Description(String),
    /// Acceptance criterion: `## accept: "validates email on blur"`
    Accept(String),
    /// Status: `## status: draft`
    Status(String),
    /// Priority: `## priority: high`
    Priority(String),
    /// Tag: `## tag: auth`
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
    /// Explicit position (only used after layout resolution or for pinning).
    Absolute { x: f32, y: f32 },
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
    /// Used for spec-only nodes: `@login_btn { ## "CTA" }`
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

    /// Named style references (`use: base_text`).
    pub use_styles: SmallVec<[NodeId; 2]>,

    /// Constraint-based positioning.
    pub constraints: SmallVec<[Constraint; 2]>,

    /// Animations attached to this node.
    pub animations: SmallVec<[AnimKeyframe; 2]>,

    /// Structured annotations (`##` lines).
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
    pub graph: DiGraph<SceneNode, ()>,

    /// The root node index.
    pub root: NodeIndex,

    /// Named style definitions (`style base_text { ... }`).
    pub styles: HashMap<NodeId, Style>,

    /// Index from NodeId → NodeIndex for fast lookup.
    pub id_index: HashMap<NodeId, NodeIndex>,

    /// Visual edges (connections between nodes).
    pub edges: Vec<Edge>,

    /// File imports with namespace aliases.
    pub imports: Vec<Import>,
}

impl SceneGraph {
    /// Create a new empty scene graph with a root node.
    #[must_use]
    pub fn new() -> Self {
        let mut graph = DiGraph::new();
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

    /// Get children of a node in insertion order.
    pub fn children(&self, idx: NodeIndex) -> Vec<NodeIndex> {
        self.graph
            .neighbors_directed(idx, petgraph::Direction::Outgoing)
            .collect()
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
            }
        }

        resolved
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
    if src.label.is_some() {
        dst.label = src.label.clone();
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
}
