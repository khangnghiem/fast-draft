use crate::layout::{Viewport, resolve_layout};
use crate::model::{
    ArrowKind, CurveKind, Edge, EdgeAnchor, NodeKind, Paint, PathCmd, ResolvedBounds, SceneGraph,
};
use petgraph::graph::NodeIndex;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize)]
pub struct ExcalidrawDocument {
    pub r#type: String,
    pub version: u32,
    pub source: String,
    pub elements: Vec<ExcalidrawElement>,
    #[serde(rename = "appState")]
    pub app_state: AppState,
    pub files: HashMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub view_background_color: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcalidrawElement {
    pub id: String,
    pub r#type: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub angle: f32,
    pub stroke_color: String,
    pub background_color: String,
    pub fill_style: String,
    pub stroke_width: f32,
    pub stroke_style: String,
    pub roughness: u32,
    pub opacity: f32,
    pub group_ids: Vec<String>,
    pub frame_id: Option<String>,
    pub roundness: Option<Roundness>,
    pub seed: u32,
    pub version: u32,
    pub version_nonce: u32,
    pub is_deleted: bool,
    pub bound_elements: Option<Vec<BoundElement>>,
    pub updated: u64,
    pub link: Option<String>,
    pub locked: bool,

    // Type specific fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<u32>, // 1: Virgil, 2: Helvetica, 3: Cascadia
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_align: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertical_align: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub points: Option<Vec<[f32; 2]>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_binding: Option<Binding>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_binding: Option<Binding>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_arrowhead: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_arrowhead: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct Roundness {
    pub r#type: u32, // 1 for adaptive, 2 for proportional
    pub value: Option<f32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundElement {
    pub id: String,
    pub r#type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub element_id: String,
    pub focus: f32,
    pub gap: f32,
}

fn extract_color(paint: &Option<Paint>) -> String {
    match paint {
        Some(Paint::Solid(color)) => color.to_hex(),
        Some(Paint::LinearGradient { stops, .. }) => {
            if let Some(stop) = stops.first() {
                stop.color.to_hex()
            } else {
                "transparent".to_string()
            }
        }
        Some(Paint::RadialGradient { stops }) => {
            if let Some(stop) = stops.first() {
                stop.color.to_hex()
            } else {
                "transparent".to_string()
            }
        }
        None => "transparent".to_string(),
    }
}

pub fn emit_excalidraw(graph: &SceneGraph) -> String {
    let mut elements = Vec::new();

    // Need layout to get node absolute positions
    let viewport = Viewport {
        width: 1920.0,
        height: 1080.0,
    };
    let resolved_layout = resolve_layout(graph, viewport);

    let mut ctx = EmitCtx {
        graph,
        layout: &resolved_layout,
        elements: &mut elements,
        group_stack: Vec::new(),
    };

    // Traverse the scene graph starting from the root
    let root_children = graph.children(graph.root);
    for child_idx in root_children {
        emit_node(&mut ctx, child_idx);
    }

    for edge in &graph.edges {
        emit_edge(&mut ctx, edge);
    }

    let doc = ExcalidrawDocument {
        r#type: "excalidraw".to_string(),
        version: 2,
        source: "fast-draft".to_string(),
        elements,
        app_state: AppState {
            view_background_color: "#ffffff".to_string(),
        },
        files: HashMap::new(),
    };

    serde_json::to_string_pretty(&doc).unwrap()
}

struct EmitCtx<'a> {
    graph: &'a SceneGraph,
    layout: &'a HashMap<NodeIndex, ResolvedBounds>,
    elements: &'a mut Vec<ExcalidrawElement>,
    group_stack: Vec<String>,
}

fn emit_node(ctx: &mut EmitCtx, idx: NodeIndex) {
    let node = &ctx.graph.graph[idx];
    let bounds = ctx.layout.get(&idx).cloned().unwrap_or(ResolvedBounds {
        x: 0.0,
        y: 0.0,
        width: 0.0,
        height: 0.0,
    });

    let style = ctx.graph.resolve_style(node, &[]);
    let bg_color = extract_color(&style.fill);

    let stroke = style.stroke.clone().unwrap_or_default();
    let stroke_color = extract_color(&Some(stroke.paint));
    let stroke_width = stroke.width;

    let opacity = style.opacity.unwrap_or(1.0) * 100.0;

    let roundness = style.corner_radius.map(|r| Roundness {
        r#type: 2, // proportional
        value: Some(r),
    });

    // Push this group onto stack if it's a group
    let is_group = matches!(node.kind, NodeKind::Group);
    if is_group {
        ctx.group_stack.push(node.id.as_str().to_string());
    }

    let mut args = CreateBaseArgs {
        id: node.id.as_str(),
        el_type: "",
        bounds,
        group_ids: &ctx.group_stack,
        bg_color,
        stroke_color,
        stroke_width,
        roundness,
        opacity,
    };

    match &node.kind {
        NodeKind::Rect { .. } | NodeKind::Frame { .. } => {
            args.el_type = "rectangle";
            ctx.elements.push(create_base_element(&args));
        }
        NodeKind::Ellipse { .. } => {
            args.el_type = "ellipse";
            ctx.elements.push(create_base_element(&args));
        }
        NodeKind::Text { content, .. } => {
            args.el_type = "text";
            let mut el = create_base_element(&args);
            el.text = Some(content.clone());
            el.font_size = style.font.as_ref().map(|f| f.size).or(Some(14.0));
            // rough mapping
            el.font_family = Some(2); // Helvetica by default

            el.text_align = Some("center".to_string());
            el.vertical_align = Some("middle".to_string());

            ctx.elements.push(el);
        }
        NodeKind::Path { commands } => {
            args.el_type = "line";
            let mut el = create_base_element(&args);

            let mut points = Vec::new();
            for cmd in commands {
                match cmd {
                    PathCmd::MoveTo(x, y) => points.push([*x, *y]),
                    PathCmd::LineTo(x, y) => points.push([*x, *y]),
                    PathCmd::QuadTo(_, _, x, y) => points.push([*x, *y]),
                    PathCmd::CubicTo(_, _, _, _, x, y) => points.push([*x, *y]),
                    PathCmd::Close => {
                        if let Some(first) = points.first() {
                            points.push(*first);
                        }
                    }
                }
            }
            el.points = Some(points);
            ctx.elements.push(el);
        }
        NodeKind::Group => {
            // Groups don't map to a specific Excalidraw element, but their IDs
            // are added to their children's groupIds array.
        }
        NodeKind::Root | NodeKind::Generic => {}
    }

    // Traverse children
    let children = ctx.graph.children(idx);
    for child_idx in children {
        emit_node(ctx, child_idx);
    }

    // Pop the group stack if this was a group
    if is_group {
        ctx.group_stack.pop();
    }
}

fn emit_edge(ctx: &mut EmitCtx, edge: &Edge) {
    let style = ctx.graph.resolve_style_for_edge(edge, &[]);

    let stroke = style.stroke.clone().unwrap_or_default();
    let stroke_color = extract_color(&Some(stroke.paint));
    let stroke_width = stroke.width;

    let (start_x, start_y, start_binding) = match &edge.from {
        EdgeAnchor::Node(id) => {
            if let Some(idx) = ctx.graph.index_of(*id) {
                if let Some(bounds) = ctx.layout.get(&idx) {
                    let center = bounds.center();
                    (
                        center.0,
                        center.1,
                        Some(Binding {
                            element_id: id.as_str().to_string(),
                            focus: 0.0,
                            gap: 1.0,
                        }),
                    )
                } else {
                    (0.0, 0.0, None)
                }
            } else {
                (0.0, 0.0, None)
            }
        }
        EdgeAnchor::Point(x, y) => (*x, *y, None),
    };

    let (end_x, end_y, end_binding): (f32, f32, Option<Binding>) = match &edge.to {
        EdgeAnchor::Node(id) => {
            if let Some(idx) = ctx.graph.index_of(*id) {
                if let Some(bounds) = ctx.layout.get(&idx) {
                    let center = bounds.center();
                    (
                        center.0,
                        center.1,
                        Some(Binding {
                            element_id: id.as_str().to_string(),
                            focus: 0.0,
                            gap: 1.0,
                        }),
                    )
                } else {
                    (0.0, 0.0, None)
                }
            } else {
                (0.0, 0.0, None)
            }
        }
        EdgeAnchor::Point(x, y) => (*x, *y, None),
    };

    // Calculate bounding box for the arrow
    let x = f32::min(start_x, end_x);
    let y = f32::min(start_y, end_y);
    let width = f32::abs(start_x - end_x);
    let height = f32::abs(start_y - end_y);

    let bounds = ResolvedBounds {
        x,
        y,
        width,
        height,
    };

    let opacity = style.opacity.unwrap_or(1.0) * 100.0;

    let mut el = create_base_element(&CreateBaseArgs {
        id: edge.id.as_str(),
        el_type: "arrow",
        bounds,
        group_ids: &[],
        bg_color: "transparent".to_string(),
        stroke_color,
        stroke_width,
        roundness: None,
        opacity,
    });

    // Points relative to x, y
    el.points = Some(vec![[start_x - x, start_y - y], [end_x - x, end_y - y]]);

    el.start_binding = start_binding;
    el.end_binding = end_binding;

    el.start_arrowhead = match edge.arrow {
        ArrowKind::Start | ArrowKind::Both => Some("arrow".to_string()),
        _ => None,
    };

    el.end_arrowhead = match edge.arrow {
        ArrowKind::End | ArrowKind::Both => Some("arrow".to_string()),
        _ => None,
    };

    if edge.curve == CurveKind::Straight || edge.curve == CurveKind::Step {
        el.roundness = None;
    } else {
        el.roundness = Some(Roundness {
            r#type: 1, // adaptive
            value: None,
        });
    }

    ctx.elements.push(el);
}

struct CreateBaseArgs<'a> {
    id: &'a str,
    el_type: &'a str,
    bounds: ResolvedBounds,
    group_ids: &'a [String],
    bg_color: String,
    stroke_color: String,
    stroke_width: f32,
    roundness: Option<Roundness>,
    opacity: f32,
}

fn create_base_element(args: &CreateBaseArgs) -> ExcalidrawElement {
    ExcalidrawElement {
        id: args.id.to_string(),
        r#type: args.el_type.to_string(),
        x: args.bounds.x,
        y: args.bounds.y,
        width: args.bounds.width.max(1.0),
        height: args.bounds.height.max(1.0),
        angle: 0.0,
        stroke_color: args.stroke_color.clone(),
        background_color: args.bg_color.clone(),
        fill_style: "solid".to_string(), // Excalidraw options: hachure, cross-hatch, solid
        stroke_width: args.stroke_width,
        stroke_style: "solid".to_string(),
        roughness: 0,
        opacity: args.opacity,
        group_ids: args.group_ids.to_vec(),
        frame_id: None,
        roundness: args.roundness.clone(),
        seed: 1,
        version: 1,
        version_nonce: 1,
        is_deleted: false,
        bound_elements: None,
        updated: 1,
        link: None,
        locked: false,

        text: None,
        font_size: None,
        font_family: None,
        text_align: None,
        vertical_align: None,
        points: None,
        start_binding: None,
        end_binding: None,
        start_arrowhead: None,
        end_arrowhead: None,
    }
}
