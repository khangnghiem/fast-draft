//! Emitter: SceneGraph → FD text format.
//!
//! Produces minimal, token-efficient output that round-trips through the parser.

use crate::id::NodeId;
use crate::model::*;
use petgraph::graph::NodeIndex;
use std::fmt::Write;

/// Emit a `SceneGraph` as an FD text document.
#[must_use]
pub fn emit_document(graph: &SceneGraph) -> String {
    let mut out = String::with_capacity(1024);

    // Count sections to decide if separators add value
    let has_imports = !graph.imports.is_empty();
    let has_styles = !graph.styles.is_empty();
    let children = graph.children(graph.root);
    let has_constraints = graph.graph.node_indices().any(|idx| {
        graph.graph[idx]
            .constraints
            .iter()
            .any(|c| !matches!(c, Constraint::Position { .. }))
    });
    let has_edges = !graph.edges.is_empty();
    let section_count =
        has_imports as u8 + has_styles as u8 + has_constraints as u8 + has_edges as u8;
    let use_separators = section_count >= 2;

    // Emit imports
    for import in &graph.imports {
        let _ = writeln!(out, "import \"{}\" as {}", import.path, import.namespace);
    }
    if has_imports {
        out.push('\n');
    }

    // Emit style definitions
    if use_separators && has_styles {
        out.push_str("# ─── Styles ───\n\n");
    }
    let mut styles: Vec<_> = graph.styles.iter().collect();
    styles.sort_by_key(|(id, _)| id.as_str().to_string());
    for (name, style) in &styles {
        emit_style_block(&mut out, name, style, 0);
        out.push('\n');
    }

    // Emit edge_defaults block (if present)
    if let Some(ref defaults) = graph.edge_defaults {
        emit_edge_defaults_block(&mut out, defaults);
        out.push('\n');
    }

    // Emit root's children (node tree)
    if use_separators && !children.is_empty() {
        out.push_str("# ─── Layout ───\n\n");
    }
    for child_idx in &children {
        emit_node(&mut out, graph, *child_idx, 0);
        out.push('\n');
    }

    // Emit top-level constraints (skip Position — emitted inline as x:/y:)
    if use_separators && has_constraints {
        out.push_str("# ─── Constraints ───\n\n");
    }
    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        for constraint in &node.constraints {
            if matches!(constraint, Constraint::Position { .. }) {
                continue; // emitted inline inside node block
            }
            emit_constraint(&mut out, &node.id, constraint);
        }
    }

    // Emit edges
    if use_separators && has_edges {
        if has_constraints {
            out.push('\n');
        }
        out.push_str("# ─── Flows ───\n\n");
    }
    for edge in &graph.edges {
        emit_edge(&mut out, edge, graph, graph.edge_defaults.as_ref());
    }

    out
}

fn indent(out: &mut String, depth: usize) {
    for _ in 0..depth {
        out.push_str("  ");
    }
}

fn emit_style_block(out: &mut String, name: &NodeId, style: &Properties, depth: usize) {
    indent(out, depth);
    writeln!(out, "style {} {{", name.as_str()).unwrap();

    if let Some(ref fill) = style.fill {
        emit_paint_prop(out, "fill", fill, depth + 1);
    }
    if let Some(ref font) = style.font {
        emit_font_prop(out, font, depth + 1);
    }
    if let Some(radius) = style.corner_radius {
        indent(out, depth + 1);
        writeln!(out, "corner: {}", format_num(radius)).unwrap();
    }
    if let Some(opacity) = style.opacity {
        indent(out, depth + 1);
        writeln!(out, "opacity: {}", format_num(opacity)).unwrap();
    }
    if let Some(ref shadow) = style.shadow {
        indent(out, depth + 1);
        writeln!(
            out,
            "shadow: ({},{},{},{})",
            format_num(shadow.offset_x),
            format_num(shadow.offset_y),
            format_num(shadow.blur),
            shadow.color.to_hex()
        )
        .unwrap();
    }
    // Text alignment
    if style.text_align.is_some() || style.text_valign.is_some() {
        let h = match style.text_align {
            Some(TextAlign::Left) => "left",
            Some(TextAlign::Right) => "right",
            _ => "center",
        };
        let v = match style.text_valign {
            Some(TextVAlign::Top) => "top",
            Some(TextVAlign::Bottom) => "bottom",
            _ => "middle",
        };
        indent(out, depth + 1);
        writeln!(out, "align: {h} {v}").unwrap();
    }

    indent(out, depth);
    out.push_str("}\n");
}

fn emit_node(out: &mut String, graph: &SceneGraph, idx: NodeIndex, depth: usize) {
    let node = &graph.graph[idx];

    // Skip empty container nodes (childless Group/Frame) on format.
    // Shapes (Rect/Ellipse/Text) are always meaningful on their own.
    // Preserve containers that still carry annotations, styles, animations,
    // or non-default inline styles (fill, stroke, etc.).
    if matches!(node.kind, NodeKind::Group | NodeKind::Frame { .. })
        && graph.children(idx).is_empty()
        && node.annotations.is_empty()
        && node.use_styles.is_empty()
        && node.animations.is_empty()
        && !has_inline_styles(&node.props)
        && !matches!(&node.kind, NodeKind::Image { .. })
    {
        return;
    }

    // Emit preserved `# comment` lines before the node declaration
    for comment in &node.comments {
        indent(out, depth);
        writeln!(out, "# {comment}").unwrap();
    }

    // Auto-generate an [auto] doc-comment for AI comprehension.
    // These are regenerated each emit and skipped by the parser.
    let auto_comment = generate_auto_comment(node, graph, idx);
    if let Some(comment) = auto_comment {
        indent(out, depth);
        writeln!(out, "# [auto] {comment}").unwrap();
    }

    indent(out, depth);

    // Node kind keyword + optional @id + optional inline text
    match &node.kind {
        NodeKind::Root => return,
        NodeKind::Generic => write!(out, "@{}", node.id.as_str()).unwrap(),
        NodeKind::Group => write!(out, "group @{}", node.id.as_str()).unwrap(),
        NodeKind::Frame { .. } => write!(out, "frame @{}", node.id.as_str()).unwrap(),
        NodeKind::Rect { .. } => write!(out, "rect @{}", node.id.as_str()).unwrap(),
        NodeKind::Ellipse { .. } => write!(out, "ellipse @{}", node.id.as_str()).unwrap(),
        NodeKind::Path { .. } => write!(out, "path @{}", node.id.as_str()).unwrap(),
        NodeKind::Image { .. } => write!(out, "image @{}", node.id.as_str()).unwrap(),
        NodeKind::Text { content, .. } => {
            write!(out, "text @{} \"{}\"", node.id.as_str(), content).unwrap();
        }
    }

    out.push_str(" {\n");

    // Annotations (spec block)
    emit_annotations(out, &node.annotations, depth + 1);

    // Children — emitted right after spec so the structural skeleton
    // is visible first. Visual styling comes at the tail for clean folding.
    let children = graph.children(idx);
    for child_idx in &children {
        emit_node(out, graph, *child_idx, depth + 1);
    }

    // Group is purely organizational — no layout mode emission

    // Layout mode (for frames)
    if let NodeKind::Frame { layout, .. } = &node.kind {
        match layout {
            LayoutMode::Free { pad } => {
                if *pad > 0.0 {
                    indent(out, depth + 1);
                    writeln!(out, "padding: {}", format_num(*pad)).unwrap();
                }
            }
            LayoutMode::Column { gap, pad } => {
                indent(out, depth + 1);
                writeln!(
                    out,
                    "layout: column gap={} pad={}",
                    format_num(*gap),
                    format_num(*pad)
                )
                .unwrap();
            }
            LayoutMode::Row { gap, pad } => {
                indent(out, depth + 1);
                writeln!(
                    out,
                    "layout: row gap={} pad={}",
                    format_num(*gap),
                    format_num(*pad)
                )
                .unwrap();
            }
            LayoutMode::Grid { cols, gap, pad } => {
                indent(out, depth + 1);
                writeln!(
                    out,
                    "layout: grid cols={cols} gap={} pad={}",
                    format_num(*gap),
                    format_num(*pad)
                )
                .unwrap();
            }
        }
    }

    // Dimensions
    match &node.kind {
        NodeKind::Rect { width, height } => {
            indent(out, depth + 1);
            writeln!(out, "w: {} h: {}", format_num(*width), format_num(*height)).unwrap();
        }
        NodeKind::Frame { width, height, .. } => {
            indent(out, depth + 1);
            writeln!(out, "w: {} h: {}", format_num(*width), format_num(*height)).unwrap();
        }
        NodeKind::Ellipse { rx, ry } => {
            indent(out, depth + 1);
            writeln!(out, "w: {} h: {}", format_num(*rx), format_num(*ry)).unwrap();
        }
        NodeKind::Text {
            max_width: Some(w), ..
        } => {
            indent(out, depth + 1);
            writeln!(out, "w: {}", format_num(*w)).unwrap();
        }
        NodeKind::Image { width, height, .. } => {
            indent(out, depth + 1);
            writeln!(out, "w: {} h: {}", format_num(*width), format_num(*height)).unwrap();
        }
        _ => {}
    }

    // Path d: commands
    if let NodeKind::Path { commands } = &node.kind
        && !commands.is_empty()
    {
        indent(out, depth + 1);
        write!(out, "d:").unwrap();
        for cmd in commands {
            match cmd {
                PathCmd::MoveTo(x, y) => {
                    write!(out, " M {} {}", format_num(*x), format_num(*y)).unwrap()
                }
                PathCmd::LineTo(x, y) => {
                    write!(out, " L {} {}", format_num(*x), format_num(*y)).unwrap()
                }
                PathCmd::QuadTo(cx, cy, ex, ey) => write!(
                    out,
                    " Q {} {} {} {}",
                    format_num(*cx),
                    format_num(*cy),
                    format_num(*ex),
                    format_num(*ey)
                )
                .unwrap(),
                PathCmd::CubicTo(c1x, c1y, c2x, c2y, ex, ey) => write!(
                    out,
                    " C {} {} {} {} {} {}",
                    format_num(*c1x),
                    format_num(*c1y),
                    format_num(*c2x),
                    format_num(*c2y),
                    format_num(*ex),
                    format_num(*ey)
                )
                .unwrap(),
                PathCmd::Close => write!(out, " Z").unwrap(),
            }
        }
        writeln!(out).unwrap();
    }

    // Image source and fit
    if let NodeKind::Image { source, fit, .. } = &node.kind {
        match source {
            ImageSource::File(path) => {
                indent(out, depth + 1);
                writeln!(out, "src: \"{path}\"").unwrap();
            }
        }
        if *fit != ImageFit::Cover {
            indent(out, depth + 1);
            let fit_str = match fit {
                ImageFit::Cover => "cover",
                ImageFit::Contain => "contain",
                ImageFit::Fill => "fill",
                ImageFit::None => "none",
            };
            writeln!(out, "fit: {fit_str}").unwrap();
        }
    }

    // Clip property (for frames only)
    if let NodeKind::Frame { clip: true, .. } = &node.kind {
        indent(out, depth + 1);
        writeln!(out, "clip: true").unwrap();
    }

    // Style references
    for style_ref in &node.use_styles {
        indent(out, depth + 1);
        writeln!(out, "use: {}", style_ref.as_str()).unwrap();
    }

    // Inline style properties
    if let Some(ref fill) = node.props.fill {
        emit_paint_prop(out, "fill", fill, depth + 1);
    }
    if let Some(ref stroke) = node.props.stroke {
        indent(out, depth + 1);
        match &stroke.paint {
            Paint::Solid(c) => {
                writeln!(out, "stroke: {} {}", c.to_hex(), format_num(stroke.width)).unwrap()
            }
            _ => writeln!(out, "stroke: #000 {}", format_num(stroke.width)).unwrap(),
        }
    }
    if let Some(radius) = node.props.corner_radius {
        indent(out, depth + 1);
        writeln!(out, "corner: {}", format_num(radius)).unwrap();
    }
    if let Some(ref font) = node.props.font {
        emit_font_prop(out, font, depth + 1);
    }
    if let Some(opacity) = node.props.opacity {
        indent(out, depth + 1);
        writeln!(out, "opacity: {}", format_num(opacity)).unwrap();
    }
    if let Some(ref shadow) = node.props.shadow {
        indent(out, depth + 1);
        writeln!(
            out,
            "shadow: ({},{},{},{})",
            format_num(shadow.offset_x),
            format_num(shadow.offset_y),
            format_num(shadow.blur),
            shadow.color.to_hex()
        )
        .unwrap();
    }

    // Text alignment
    if node.props.text_align.is_some() || node.props.text_valign.is_some() {
        let h = match node.props.text_align {
            Some(TextAlign::Left) => "left",
            Some(TextAlign::Right) => "right",
            _ => "center",
        };
        let v = match node.props.text_valign {
            Some(TextVAlign::Top) => "top",
            Some(TextVAlign::Bottom) => "bottom",
            _ => "middle",
        };
        indent(out, depth + 1);
        writeln!(out, "align: {h} {v}").unwrap();
    }

    // Child placement within parent
    if let Some((h, v)) = node.place {
        indent(out, depth + 1);
        let place_str = match (h, v) {
            (HPlace::Center, VPlace::Middle) => "center".to_string(),
            (HPlace::Left, VPlace::Top) => "top-left".to_string(),
            (HPlace::Center, VPlace::Top) => "top".to_string(),
            (HPlace::Right, VPlace::Top) => "top-right".to_string(),
            (HPlace::Left, VPlace::Middle) => "left middle".to_string(),
            (HPlace::Right, VPlace::Middle) => "right middle".to_string(),
            (HPlace::Left, VPlace::Bottom) => "bottom-left".to_string(),
            (HPlace::Center, VPlace::Bottom) => "bottom".to_string(),
            (HPlace::Right, VPlace::Bottom) => "bottom-right".to_string(),
        };
        writeln!(out, "place: {place_str}").unwrap();
    }

    // Inline position (x: / y:) — emitted here for token efficiency
    for constraint in &node.constraints {
        if let Constraint::Position { x, y } = constraint {
            if *x != 0.0 {
                indent(out, depth + 1);
                writeln!(out, "x: {}", format_num(*x)).unwrap();
            }
            if *y != 0.0 {
                indent(out, depth + 1);
                writeln!(out, "y: {}", format_num(*y)).unwrap();
            }
        }
    }

    // Animations (when blocks)
    for anim in &node.animations {
        emit_anim(out, anim, depth + 1);
    }

    indent(out, depth);
    out.push_str("}\n");
}

fn emit_annotations(out: &mut String, annotations: &[Annotation], depth: usize) {
    if annotations.is_empty() {
        return;
    }

    // Single description → inline shorthand: `spec "desc"`
    if annotations.len() == 1
        && let Annotation::Description(s) = &annotations[0]
    {
        indent(out, depth);
        writeln!(out, "spec \"{s}\"").unwrap();
        return;
    }

    // Multiple annotations → block form: `spec { ... }`
    indent(out, depth);
    out.push_str("spec {\n");
    for ann in annotations {
        indent(out, depth + 1);
        match ann {
            Annotation::Description(s) => writeln!(out, "\"{s}\"").unwrap(),
            Annotation::Accept(s) => writeln!(out, "accept: \"{s}\"").unwrap(),
            Annotation::Status(s) => writeln!(out, "status: {s}").unwrap(),
            Annotation::Priority(s) => writeln!(out, "priority: {s}").unwrap(),
            Annotation::Tag(s) => writeln!(out, "tag: {s}").unwrap(),
        }
    }
    indent(out, depth);
    out.push_str("}\n");
}

fn emit_paint_prop(out: &mut String, name: &str, paint: &Paint, depth: usize) {
    indent(out, depth);
    match paint {
        Paint::Solid(c) => {
            let hex = c.to_hex();
            let hint = color_hint(&hex);
            if hint.is_empty() {
                writeln!(out, "{name}: {hex}").unwrap();
            } else {
                writeln!(out, "{name}: {hex}  # {hint}").unwrap();
            }
        }
        Paint::LinearGradient { angle, stops } => {
            write!(out, "{name}: linear({}deg", format_num(*angle)).unwrap();
            for stop in stops {
                write!(out, ", {} {}", stop.color.to_hex(), format_num(stop.offset)).unwrap();
            }
            writeln!(out, ")").unwrap();
        }
        Paint::RadialGradient { stops } => {
            write!(out, "{name}: radial(").unwrap();
            for (i, stop) in stops.iter().enumerate() {
                if i > 0 {
                    write!(out, ", ").unwrap();
                }
                write!(out, "{} {}", stop.color.to_hex(), format_num(stop.offset)).unwrap();
            }
            writeln!(out, ")").unwrap();
        }
    }
}

fn emit_font_prop(out: &mut String, font: &FontSpec, depth: usize) {
    indent(out, depth);
    let weight_str = weight_number_to_name(font.weight);
    writeln!(
        out,
        "font: \"{}\" {} {}",
        font.family,
        weight_str,
        format_num(font.size)
    )
    .unwrap();
}

/// Map numeric font weight to human-readable name.
fn weight_number_to_name(weight: u16) -> &'static str {
    match weight {
        100 => "thin",
        200 => "extralight",
        300 => "light",
        400 => "regular",
        500 => "medium",
        600 => "semibold",
        700 => "bold",
        800 => "extrabold",
        900 => "black",
        _ => "400", // fallback
    }
}

/// Classify a hex color into a human-readable hue name.
fn color_hint(hex: &str) -> &'static str {
    let hex = hex.trim_start_matches('#');
    let bytes = hex.as_bytes();
    let Some((r, g, b)) = (match bytes.len() {
        3 | 4 => {
            let r = crate::model::hex_val(bytes[0]).unwrap_or(0) * 17;
            let g = crate::model::hex_val(bytes[1]).unwrap_or(0) * 17;
            let b = crate::model::hex_val(bytes[2]).unwrap_or(0) * 17;
            Some((r, g, b))
        }
        6 | 8 => {
            let r = (crate::model::hex_val(bytes[0]).unwrap_or(0) << 4)
                | crate::model::hex_val(bytes[1]).unwrap_or(0);
            let g = (crate::model::hex_val(bytes[2]).unwrap_or(0) << 4)
                | crate::model::hex_val(bytes[3]).unwrap_or(0);
            let b = (crate::model::hex_val(bytes[4]).unwrap_or(0) << 4)
                | crate::model::hex_val(bytes[5]).unwrap_or(0);
            Some((r, g, b))
        }
        _ => None,
    }) else {
        return "";
    };

    // Achromatic check
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let diff = max - min;
    if diff < 15 {
        return match max {
            0..=30 => "black",
            31..=200 => "gray",
            _ => "white",
        };
    }

    // Hue classification
    let rf = r as f32;
    let gf = g as f32;
    let bf = b as f32;
    let hue = if max == r {
        60.0 * (((gf - bf) / diff as f32) % 6.0)
    } else if max == g {
        60.0 * (((bf - rf) / diff as f32) + 2.0)
    } else {
        60.0 * (((rf - gf) / diff as f32) + 4.0)
    };
    let hue = if hue < 0.0 { hue + 360.0 } else { hue };

    match hue as u16 {
        0..=14 | 346..=360 => "red",
        15..=39 => "orange",
        40..=64 => "yellow",
        65..=79 => "lime",
        80..=159 => "green",
        160..=179 => "teal",
        180..=199 => "cyan",
        200..=259 => "blue",
        260..=279 => "purple",
        280..=319 => "pink",
        320..=345 => "rose",
        _ => "",
    }
}

fn emit_anim(out: &mut String, anim: &AnimKeyframe, depth: usize) {
    indent(out, depth);
    let trigger = match &anim.trigger {
        AnimTrigger::Hover => "hover",
        AnimTrigger::Press => "press",
        AnimTrigger::Enter => "enter",
        AnimTrigger::Custom(s) => s.as_str(),
    };
    writeln!(out, "when :{trigger} {{").unwrap();

    if let Some(ref fill) = anim.properties.fill {
        emit_paint_prop(out, "fill", fill, depth + 1);
    }
    if let Some(opacity) = anim.properties.opacity {
        indent(out, depth + 1);
        writeln!(out, "opacity: {}", format_num(opacity)).unwrap();
    }
    if let Some(scale) = anim.properties.scale {
        indent(out, depth + 1);
        writeln!(out, "scale: {}", format_num(scale)).unwrap();
    }
    if let Some(rotate) = anim.properties.rotate {
        indent(out, depth + 1);
        writeln!(out, "rotate: {}", format_num(rotate)).unwrap();
    }

    let ease_name = match &anim.easing {
        Easing::Linear => "linear",
        Easing::EaseIn => "ease_in",
        Easing::EaseOut => "ease_out",
        Easing::EaseInOut => "ease_in_out",
        Easing::Spring => "spring",
        Easing::CubicBezier(_, _, _, _) => "cubic",
    };
    indent(out, depth + 1);
    writeln!(out, "ease: {ease_name} {}ms", anim.duration_ms).unwrap();

    if let Some(delay) = anim.delay_ms {
        indent(out, depth + 1);
        writeln!(out, "delay: {delay}ms").unwrap();
    }

    indent(out, depth);
    out.push_str("}\n");
}

fn emit_constraint(out: &mut String, node_id: &NodeId, constraint: &Constraint) {
    match constraint {
        Constraint::CenterIn(target) => {
            writeln!(
                out,
                "@{} -> center_in: {}",
                node_id.as_str(),
                target.as_str()
            )
            .unwrap();
        }
        Constraint::Offset { from, dx, dy } => {
            writeln!(
                out,
                "@{} -> offset: @{} {}, {}",
                node_id.as_str(),
                from.as_str(),
                format_num(*dx),
                format_num(*dy)
            )
            .unwrap();
        }
        Constraint::FillParent { pad } => {
            writeln!(
                out,
                "@{} -> fill_parent: {}",
                node_id.as_str(),
                format_num(*pad)
            )
            .unwrap();
        }
        Constraint::Position { .. } => {
            // Emitted inline as x: / y: inside node block — skip here
        }
    }
}

fn emit_edge_defaults_block(out: &mut String, defaults: &EdgeDefaults) {
    out.push_str("edge_defaults {\n");

    if let Some(ref stroke) = defaults.props.stroke {
        match &stroke.paint {
            Paint::Solid(c) => {
                writeln!(out, "  stroke: {} {}", c.to_hex(), format_num(stroke.width)).unwrap();
            }
            _ => {
                writeln!(out, "  stroke: #000 {}", format_num(stroke.width)).unwrap();
            }
        }
    }
    if let Some(opacity) = defaults.props.opacity {
        writeln!(out, "  opacity: {}", format_num(opacity)).unwrap();
    }
    if let Some(arrow) = defaults.arrow
        && arrow != ArrowKind::None
    {
        let name = match arrow {
            ArrowKind::None => "none",
            ArrowKind::Start => "start",
            ArrowKind::End => "end",
            ArrowKind::Both => "both",
        };
        writeln!(out, "  arrow: {name}").unwrap();
    }
    if let Some(curve) = defaults.curve
        && curve != CurveKind::Straight
    {
        let name = match curve {
            CurveKind::Straight => "straight",
            CurveKind::Smooth => "smooth",
            CurveKind::Step => "step",
        };
        writeln!(out, "  curve: {name}").unwrap();
    }

    out.push_str("}\n");
}

fn emit_edge(out: &mut String, edge: &Edge, graph: &SceneGraph, defaults: Option<&EdgeDefaults>) {
    writeln!(out, "edge @{} {{", edge.id.as_str()).unwrap();

    // Annotations
    emit_annotations(out, &edge.annotations, 1);

    // Nested text child
    if let Some(text_id) = edge.text_child
        && let Some(node) = graph.get_by_id(text_id)
        && let NodeKind::Text { content, .. } = &node.kind
    {
        writeln!(out, "  text @{} \"{}\" {{}}", text_id.as_str(), content).unwrap();
    }

    // from / to
    match &edge.from {
        EdgeAnchor::Node(id) => writeln!(out, "  from: @{}", id.as_str()).unwrap(),
        EdgeAnchor::Point(x, y) => {
            writeln!(out, "  from: {} {}", format_num(*x), format_num(*y)).unwrap()
        }
    }
    match &edge.to {
        EdgeAnchor::Node(id) => writeln!(out, "  to: @{}", id.as_str()).unwrap(),
        EdgeAnchor::Point(x, y) => {
            writeln!(out, "  to: {} {}", format_num(*x), format_num(*y)).unwrap()
        }
    }

    // Style references
    for style_ref in &edge.use_styles {
        writeln!(out, "  use: {}", style_ref.as_str()).unwrap();
    }

    // Stroke — skip if matches edge_defaults
    let stroke_matches_default = defaults
        .and_then(|d| d.props.stroke.as_ref())
        .is_some_and(|ds| {
            edge.props
                .stroke
                .as_ref()
                .is_some_and(|es| stroke_eq(es, ds))
        });
    if !stroke_matches_default && let Some(ref stroke) = edge.props.stroke {
        match &stroke.paint {
            Paint::Solid(c) => {
                writeln!(out, "  stroke: {} {}", c.to_hex(), format_num(stroke.width)).unwrap();
            }
            _ => {
                writeln!(out, "  stroke: #000 {}", format_num(stroke.width)).unwrap();
            }
        }
    }

    // Opacity — skip if matches edge_defaults
    let opacity_matches_default = defaults.and_then(|d| d.props.opacity).is_some_and(|do_| {
        edge.props
            .opacity
            .is_some_and(|eo| (eo - do_).abs() < 0.001)
    });
    if !opacity_matches_default && let Some(opacity) = edge.props.opacity {
        writeln!(out, "  opacity: {}", format_num(opacity)).unwrap();
    }

    // Arrow — skip if matches edge_defaults
    let arrow_matches_default = defaults
        .and_then(|d| d.arrow)
        .is_some_and(|da| edge.arrow == da);
    if !arrow_matches_default && edge.arrow != ArrowKind::None {
        let name = match edge.arrow {
            ArrowKind::None => "none",
            ArrowKind::Start => "start",
            ArrowKind::End => "end",
            ArrowKind::Both => "both",
        };
        writeln!(out, "  arrow: {name}").unwrap();
    }

    // Curve — skip if matches edge_defaults
    let curve_matches_default = defaults
        .and_then(|d| d.curve)
        .is_some_and(|dc| edge.curve == dc);
    if !curve_matches_default && edge.curve != CurveKind::Straight {
        let name = match edge.curve {
            CurveKind::Straight => "straight",
            CurveKind::Smooth => "smooth",
            CurveKind::Step => "step",
        };
        writeln!(out, "  curve: {name}").unwrap();
    }

    // Flow animation
    if let Some(ref flow) = edge.flow {
        let kind = match flow.kind {
            FlowKind::Pulse => "pulse",
            FlowKind::Dash => "dash",
        };
        writeln!(out, "  flow: {} {}ms", kind, flow.duration_ms).unwrap();
    }

    // Label offset (dragged position)
    if let Some((ox, oy)) = edge.label_offset {
        writeln!(out, "  label_offset: {} {}", format_num(ox), format_num(oy)).unwrap();
    }

    // Trigger animations
    for anim in &edge.animations {
        emit_anim(out, anim, 1);
    }

    out.push_str("}\n");
}

/// Generate an auto-comment for AI comprehension based on node heuristics.
///
/// Returns `None` if the node doesn't benefit from extra context.
fn generate_auto_comment(node: &SceneNode, graph: &SceneGraph, idx: NodeIndex) -> Option<String> {
    match &node.kind {
        NodeKind::Root => None,
        // Text nodes are self-documenting via inline "content" — skip auto-comment
        NodeKind::Text { .. } => None,
        NodeKind::Group => {
            let count = graph.children(idx).len();
            if count > 0 {
                Some(format!("container ({count} children)"))
            } else {
                None
            }
        }
        NodeKind::Frame { layout, .. } => {
            let count = graph.children(idx).len();
            let layout_str = match layout {
                LayoutMode::Free { .. } => "free",
                LayoutMode::Column { .. } => "column",
                LayoutMode::Row { .. } => "row",
                LayoutMode::Grid { .. } => "grid",
            };
            Some(format!("{layout_str} container ({count} children)"))
        }
        _ => {
            // For shapes: mention use: style if present
            if let Some(first_style) = node.use_styles.first() {
                Some(format!("styled: {}", first_style.as_str()))
            } else {
                // Check if connected via edges
                let edge_target_ids: Vec<NodeId> = graph
                    .edges
                    .iter()
                    .filter(|e| e.from.node_id() == Some(node.id))
                    .filter_map(|e| e.to.node_id())
                    .collect();
                if !edge_target_ids.is_empty() {
                    let names: Vec<&str> = edge_target_ids.iter().map(|id| id.as_str()).collect();
                    Some(format!("connects to {}", names.join(", ")))
                } else {
                    None
                }
            }
        }
    }
}

/// Compare two stroke values for equality (using f32 approximate comparison).
fn stroke_eq(a: &Stroke, b: &Stroke) -> bool {
    (a.width - b.width).abs() < 0.001 && a.paint == b.paint
}

// ─── Read Modes (filtered emit for AI agents) ────────────────────────────

/// What an AI agent wants to read from the document.
///
/// Each mode selectively emits only the properties relevant to a specific
/// concern, saving 50-80% tokens while preserving structural understanding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReadMode {
    /// Full file — no filtering (identical to `emit_document`).
    Full,
    /// Node types, `@id`s, parent-child nesting only.
    Structure,
    /// Structure + dimensions (`w:`/`h:`) + `layout:` directives + constraints.
    Layout,
    /// Structure + styles + `fill:`/`stroke:`/`font:`/`corner:`/`use:` refs.
    Design,
    /// Structure + `spec {}` blocks + annotations.
    Spec,
    /// Layout + Design + When combined — the full visual story.
    Visual,
    /// Structure + `when :trigger { ... }` animation blocks only.
    When,
    /// Structure + `edge @id { ... }` blocks.
    Edges,
    /// Only shows changes since a previous snapshot.
    /// Requires calling `snapshot_graph` first to create a baseline.
    Diff,
}

/// Emit a `SceneGraph` filtered to show only the properties relevant to `mode`.
///
/// - `Full`: identical to `emit_document`.
/// - `Structure`: node kind + `@id` + children. No styles, dims, anims, specs.
/// - `Layout`: structure + `w:`/`h:` + `layout:` + constraints (`->`).
/// - `Design`: structure + styles + `fill:`/`stroke:`/`font:`/`corner:`/`use:`.
/// - `Spec`: structure + `spec {}` blocks.
/// - `Visual`: layout + design + when combined.
/// - `When`: structure + `when :trigger { ... }` blocks.
/// - `Edges`: structure + `edge @id { ... }` blocks.
#[must_use]
pub fn emit_filtered(graph: &SceneGraph, mode: ReadMode) -> String {
    if mode == ReadMode::Full {
        return emit_document(graph);
    }
    if mode == ReadMode::Diff {
        // Diff mode requires a snapshot — use emit_diff() directly
        return String::from("# Use emit_diff(graph, &snapshot) for Diff mode\n");
    }

    let mut out = String::with_capacity(1024);

    let children = graph.children(graph.root);
    let include_styles = matches!(mode, ReadMode::Design | ReadMode::Visual);
    let include_constraints = matches!(mode, ReadMode::Layout | ReadMode::Visual);
    let include_edges = matches!(mode, ReadMode::Edges | ReadMode::Visual);

    // Styles (Design and Visual modes)
    if include_styles && !graph.styles.is_empty() {
        let mut styles: Vec<_> = graph.styles.iter().collect();
        styles.sort_by_key(|(id, _)| id.as_str().to_string());
        for (name, style) in &styles {
            emit_style_block(&mut out, name, style, 0);
            out.push('\n');
        }
    }

    // Node tree (always emitted, but with per-mode filtering)
    for child_idx in &children {
        emit_node_filtered(&mut out, graph, *child_idx, 0, mode);
        out.push('\n');
    }

    // Constraints (Layout and Visual modes)
    if include_constraints {
        for idx in graph.graph.node_indices() {
            let node = &graph.graph[idx];
            for constraint in &node.constraints {
                if matches!(constraint, Constraint::Position { .. }) {
                    continue;
                }
                emit_constraint(&mut out, &node.id, constraint);
            }
        }
    }

    // Edges (Edges and Visual modes)
    if include_edges {
        for edge in &graph.edges {
            emit_edge(&mut out, edge, graph, graph.edge_defaults.as_ref());
            out.push('\n');
        }
    }

    out
}

/// Emit a single node with mode-based property filtering.
fn emit_node_filtered(
    out: &mut String,
    graph: &SceneGraph,
    idx: NodeIndex,
    depth: usize,
    mode: ReadMode,
) {
    let node = &graph.graph[idx];

    if matches!(node.kind, NodeKind::Root) {
        return;
    }

    indent(out, depth);

    // Node kind + @id (always emitted)
    match &node.kind {
        NodeKind::Root => return,
        NodeKind::Generic => write!(out, "@{}", node.id.as_str()).unwrap(),
        NodeKind::Group => write!(out, "group @{}", node.id.as_str()).unwrap(),
        NodeKind::Frame { .. } => write!(out, "frame @{}", node.id.as_str()).unwrap(),
        NodeKind::Rect { .. } => write!(out, "rect @{}", node.id.as_str()).unwrap(),
        NodeKind::Ellipse { .. } => write!(out, "ellipse @{}", node.id.as_str()).unwrap(),
        NodeKind::Path { .. } => write!(out, "path @{}", node.id.as_str()).unwrap(),
        NodeKind::Image { .. } => write!(out, "image @{}", node.id.as_str()).unwrap(),
        NodeKind::Text { content, .. } => {
            write!(out, "text @{} \"{}\"", node.id.as_str(), content).unwrap();
        }
    }

    out.push_str(" {\n");

    // Spec annotations (Spec mode only)
    if mode == ReadMode::Spec {
        emit_annotations(out, &node.annotations, depth + 1);
    }

    // Children (always recurse)
    let children = graph.children(idx);
    for child_idx in &children {
        emit_node_filtered(out, graph, *child_idx, depth + 1, mode);
    }

    // Layout directives (Layout and Visual modes)
    if matches!(mode, ReadMode::Layout | ReadMode::Visual) {
        emit_layout_mode_filtered(out, &node.kind, depth + 1);
    }

    // Dimensions (Layout and Visual modes)
    if matches!(mode, ReadMode::Layout | ReadMode::Visual) {
        emit_dimensions_filtered(out, &node.kind, depth + 1);
    }

    // Style properties (Design and Visual modes)
    if matches!(mode, ReadMode::Design | ReadMode::Visual) {
        for style_ref in &node.use_styles {
            indent(out, depth + 1);
            writeln!(out, "use: {}", style_ref.as_str()).unwrap();
        }
        if let Some(ref fill) = node.props.fill {
            emit_paint_prop(out, "fill", fill, depth + 1);
        }
        if let Some(ref stroke) = node.props.stroke {
            indent(out, depth + 1);
            match &stroke.paint {
                Paint::Solid(c) => {
                    writeln!(out, "stroke: {} {}", c.to_hex(), format_num(stroke.width)).unwrap();
                }
                _ => writeln!(out, "stroke: #000 {}", format_num(stroke.width)).unwrap(),
            }
        }
        if let Some(radius) = node.props.corner_radius {
            indent(out, depth + 1);
            writeln!(out, "corner: {}", format_num(radius)).unwrap();
        }
        if let Some(ref font) = node.props.font {
            emit_font_prop(out, font, depth + 1);
        }
        if let Some(opacity) = node.props.opacity {
            indent(out, depth + 1);
            writeln!(out, "opacity: {}", format_num(opacity)).unwrap();
        }
    }

    // Inline position (Layout and Visual modes)
    if matches!(mode, ReadMode::Layout | ReadMode::Visual) {
        for constraint in &node.constraints {
            if let Constraint::Position { x, y } = constraint {
                if *x != 0.0 {
                    indent(out, depth + 1);
                    writeln!(out, "x: {}", format_num(*x)).unwrap();
                }
                if *y != 0.0 {
                    indent(out, depth + 1);
                    writeln!(out, "y: {}", format_num(*y)).unwrap();
                }
            }
        }
    }

    // Animations / when blocks (When and Visual modes)
    if matches!(mode, ReadMode::When | ReadMode::Visual) {
        for anim in &node.animations {
            emit_anim(out, anim, depth + 1);
        }
    }

    indent(out, depth);
    out.push_str("}\n");
}

/// Emit layout mode directive for groups and frames (filtered path).
fn emit_layout_mode_filtered(out: &mut String, kind: &NodeKind, depth: usize) {
    let layout = match kind {
        NodeKind::Frame { layout, .. } => layout,
        _ => return, // Group is always Free — no layout emission
    };
    match layout {
        LayoutMode::Free { pad } => {
            if *pad > 0.0 {
                indent(out, depth);
                writeln!(out, "padding: {}", format_num(*pad)).unwrap();
            }
        }
        LayoutMode::Column { gap, pad } => {
            indent(out, depth);
            writeln!(
                out,
                "layout: column gap={} pad={}",
                format_num(*gap),
                format_num(*pad)
            )
            .unwrap();
        }
        LayoutMode::Row { gap, pad } => {
            indent(out, depth);
            writeln!(
                out,
                "layout: row gap={} pad={}",
                format_num(*gap),
                format_num(*pad)
            )
            .unwrap();
        }
        LayoutMode::Grid { cols, gap, pad } => {
            indent(out, depth);
            writeln!(
                out,
                "layout: grid cols={cols} gap={} pad={}",
                format_num(*gap),
                format_num(*pad)
            )
            .unwrap();
        }
    }
}

/// Emit dimension properties (w/h) for sized nodes (filtered path).
fn emit_dimensions_filtered(out: &mut String, kind: &NodeKind, depth: usize) {
    match kind {
        NodeKind::Rect { width, height } | NodeKind::Frame { width, height, .. } => {
            indent(out, depth);
            writeln!(out, "w: {} h: {}", format_num(*width), format_num(*height)).unwrap();
        }
        NodeKind::Ellipse { rx, ry } => {
            indent(out, depth);
            writeln!(out, "w: {} h: {}", format_num(*rx), format_num(*ry)).unwrap();
        }
        NodeKind::Image { width, height, .. } => {
            indent(out, depth);
            writeln!(out, "w: {} h: {}", format_num(*width), format_num(*height)).unwrap();
        }
        _ => {}
    }
}

// ─── Spec Markdown Export ─────────────────────────────────────────────────

/// Emit a `SceneGraph` as a markdown spec document.
///
/// Extracts only `@id` names, `spec { ... }` annotations, hierarchy, and edges —
/// all visual properties (fill, stroke, dimensions, animations) are omitted.
/// Intended for PM-facing spec reports.
#[must_use]
pub fn emit_spec_markdown(graph: &SceneGraph, title: &str) -> String {
    let mut out = String::with_capacity(512);
    writeln!(out, "# Spec: {title}\n").unwrap();

    // Emit root's children
    let children = graph.children(graph.root);
    for child_idx in &children {
        emit_spec_node(&mut out, graph, *child_idx, 2);
    }

    // Emit edges as flow descriptions
    if !graph.edges.is_empty() {
        out.push_str("\n---\n\n## Flows\n\n");
        for edge in &graph.edges {
            let from_str = match &edge.from {
                EdgeAnchor::Node(id) => format!("@{}", id.as_str()),
                EdgeAnchor::Point(x, y) => format!("({}, {})", x, y),
            };
            let to_str = match &edge.to {
                EdgeAnchor::Node(id) => format!("@{}", id.as_str()),
                EdgeAnchor::Point(x, y) => format!("({}, {})", x, y),
            };
            write!(out, "- **{}** → **{}**", from_str, to_str).unwrap();
            if let Some(text_id) = edge.text_child
                && let Some(node) = graph.get_by_id(text_id)
                && let NodeKind::Text { content, .. } = &node.kind
            {
                write!(out, " — {content}").unwrap();
            }
            out.push('\n');
            emit_spec_annotations(&mut out, &edge.annotations, "  ");
        }
    }

    out
}

fn emit_spec_node(out: &mut String, graph: &SceneGraph, idx: NodeIndex, heading_level: usize) {
    let node = &graph.graph[idx];

    // Skip nodes with no annotations and no annotated children
    let has_annotations = !node.annotations.is_empty();
    let children = graph.children(idx);
    let has_annotated_children = children
        .iter()
        .any(|c| has_annotations_recursive(graph, *c));

    if !has_annotations && !has_annotated_children {
        return;
    }

    // Heading: ## @node_id (kind)
    let hashes = "#".repeat(heading_level.min(6));
    let kind_label = match &node.kind {
        NodeKind::Root => return,
        NodeKind::Generic => "spec",
        NodeKind::Group => "group",
        NodeKind::Frame { .. } => "frame",
        NodeKind::Rect { .. } => "rect",
        NodeKind::Ellipse { .. } => "ellipse",
        NodeKind::Path { .. } => "path",
        NodeKind::Image { .. } => "image",
        NodeKind::Text { .. } => "text",
    };
    writeln!(out, "{hashes} @{} `{kind_label}`\n", node.id.as_str()).unwrap();

    // Annotation details
    emit_spec_annotations(out, &node.annotations, "");

    // Children (recurse with deeper heading level)
    for child_idx in &children {
        emit_spec_node(out, graph, *child_idx, heading_level + 1);
    }
}

fn has_annotations_recursive(graph: &SceneGraph, idx: NodeIndex) -> bool {
    let node = &graph.graph[idx];
    if !node.annotations.is_empty() {
        return true;
    }
    graph
        .children(idx)
        .iter()
        .any(|c| has_annotations_recursive(graph, *c))
}

fn emit_spec_annotations(out: &mut String, annotations: &[Annotation], prefix: &str) {
    for ann in annotations {
        match ann {
            Annotation::Description(s) => writeln!(out, "{prefix}> {s}").unwrap(),
            Annotation::Accept(s) => writeln!(out, "{prefix}- [ ] {s}").unwrap(),
            Annotation::Status(s) => writeln!(out, "{prefix}- **Status:** {s}").unwrap(),
            Annotation::Priority(s) => writeln!(out, "{prefix}- **Priority:** {s}").unwrap(),
            Annotation::Tag(s) => writeln!(out, "{prefix}- **Tag:** {s}").unwrap(),
        }
    }
    if !annotations.is_empty() {
        out.push('\n');
    }
}

/// Check if a `Style` has any non-default properties set.
fn has_inline_styles(style: &Properties) -> bool {
    style.fill.is_some()
        || style.stroke.is_some()
        || style.font.is_some()
        || style.corner_radius.is_some()
        || style.opacity.is_some()
        || style.shadow.is_some()
        || style.text_align.is_some()
        || style.text_valign.is_some()
        || style.scale.is_some()
}

/// Format a float without trailing zeros for compact output.
pub(crate) fn format_num(n: f32) -> String {
    if n == n.floor() {
        format!("{}", n as i32)
    } else {
        format!("{n:.1}")
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_string()
    }
}

// ─── Snapshot / Diff ─────────────────────────────────────────────────────

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

/// Create a hash-based snapshot of the current graph state.
///
/// Each node and edge is independently emitted to a string and hashed.
/// This avoids implementing `Hash` on f32-containing types while staying
/// memory-efficient (only stores u64 per element instead of full copies).
#[must_use]
pub fn snapshot_graph(graph: &SceneGraph) -> GraphSnapshot {
    let mut snapshot = GraphSnapshot::default();

    // Hash each node
    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        if matches!(node.kind, NodeKind::Root) {
            continue;
        }
        let mut buf = String::new();
        emit_node(&mut buf, graph, idx, 0);
        let mut hasher = DefaultHasher::new();
        buf.hash(&mut hasher);
        snapshot.node_hashes.insert(node.id, hasher.finish());
    }

    // Hash each edge
    for edge in &graph.edges {
        let mut buf = String::new();
        emit_edge(&mut buf, edge, graph, graph.edge_defaults.as_ref());
        let mut hasher = DefaultHasher::new();
        buf.hash(&mut hasher);
        snapshot.edge_hashes.insert(edge.id, hasher.finish());
    }

    snapshot
}

/// Emit the diff between the current graph and a previous snapshot.
///
/// Output format:
/// - `+ node/edge` block: added (not in snapshot)
/// - `~ node/edge` block: modified (hash differs)
/// - `- @id`: removed (in snapshot but not in current graph)
#[must_use]
pub fn emit_diff(graph: &SceneGraph, prev: &GraphSnapshot) -> String {
    let mut out = String::with_capacity(512);

    // Check nodes: added or modified
    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        if matches!(node.kind, NodeKind::Root) {
            continue;
        }

        let mut buf = String::new();
        emit_node(&mut buf, graph, idx, 0);
        let mut hasher = DefaultHasher::new();
        buf.hash(&mut hasher);
        let current_hash = hasher.finish();

        match prev.node_hashes.get(&node.id) {
            None => {
                // Added
                out.push_str("+ ");
                out.push_str(&buf);
                out.push('\n');
            }
            Some(&prev_hash) if prev_hash != current_hash => {
                // Modified
                out.push_str("~ ");
                out.push_str(&buf);
                out.push('\n');
            }
            _ => {} // Unchanged
        }
    }

    // Check edges: added or modified
    for edge in &graph.edges {
        let mut buf = String::new();
        emit_edge(&mut buf, edge, graph, graph.edge_defaults.as_ref());
        let mut hasher = DefaultHasher::new();
        buf.hash(&mut hasher);
        let current_hash = hasher.finish();

        match prev.edge_hashes.get(&edge.id) {
            None => {
                out.push_str("+ ");
                out.push_str(&buf);
                out.push('\n');
            }
            Some(&prev_hash) if prev_hash != current_hash => {
                out.push_str("~ ");
                out.push_str(&buf);
                out.push('\n');
            }
            _ => {}
        }
    }

    // Check for removed nodes
    for id in prev.node_hashes.keys() {
        if graph.get_by_id(*id).is_none() {
            writeln!(out, "- @{}", id.as_str()).unwrap();
        }
    }

    // Check for removed edges
    let current_edge_ids: std::collections::HashSet<NodeId> =
        graph.edges.iter().map(|e| e.id).collect();
    for id in prev.edge_hashes.keys() {
        if !current_edge_ids.contains(id) {
            writeln!(out, "- edge @{}", id.as_str()).unwrap();
        }
    }

    if out.is_empty() {
        out.push_str("# No changes\n");
    }

    out
}

#[cfg(test)]
#[path = "emitter_tests.rs"]
mod tests;
