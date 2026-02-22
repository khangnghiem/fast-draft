//! Parser for the FD text format → SceneGraph.
//!
//! Built on `winnow` 0.7 for efficient, streaming parsing.
//! Handles: comments, style definitions, node declarations
//! (group, rect, ellipse, path, text), inline properties, animations,
//! and top-level constraints.

use crate::id::NodeId;
use crate::model::*;
use winnow::ascii::space1;
use winnow::combinator::{alt, delimited, opt, preceded};
use winnow::error::ContextError;
use winnow::prelude::*;
use winnow::token::{take_till, take_while};

/// Parse an FD document string into a `SceneGraph`.
#[must_use = "parsing result should be used"]
pub fn parse_document(input: &str) -> Result<SceneGraph, String> {
    let mut graph = SceneGraph::new();
    let mut rest = input;

    skip_ws_and_comments(&mut rest);

    while !rest.is_empty() {
        if rest.starts_with("style ") {
            let (name, style) = parse_style_block
                .parse_next(&mut rest)
                .map_err(|e| format!("Style parse error: {e}"))?;
            graph.define_style(name, style);
        } else if rest.starts_with("##") {
            // Top-level annotations are ignored (they only apply inside nodes)
            let _ = take_till::<_, _, ContextError>(0.., '\n').parse_next(&mut rest);
            if rest.starts_with('\n') {
                rest = &rest[1..];
            }
        } else if rest.starts_with('@') {
            if is_generic_node_start(rest) {
                let node_data = parse_node
                    .parse_next(&mut rest)
                    .map_err(|e| format!("Node parse error: {e}"))?;
                let root = graph.root;
                insert_node_recursive(&mut graph, root, node_data);
            } else {
                let (node_id, constraint) = parse_constraint_line
                    .parse_next(&mut rest)
                    .map_err(|e| format!("Constraint parse error: {e}"))?;
                if let Some(node) = graph.get_by_id_mut(node_id) {
                    node.constraints.push(constraint);
                }
            }
        } else if rest.starts_with("edge ") {
            let edge = parse_edge_block
                .parse_next(&mut rest)
                .map_err(|e| format!("Edge parse error: {e}"))?;
            graph.edges.push(edge);
        } else if starts_with_node_keyword(rest) {
            let node_data = parse_node
                .parse_next(&mut rest)
                .map_err(|e| format!("Node parse error: {e}"))?;
            let root = graph.root;
            insert_node_recursive(&mut graph, root, node_data);
        } else {
            // Skip unknown line
            let _ = take_till::<_, _, ContextError>(0.., '\n').parse_next(&mut rest);
            if rest.starts_with('\n') {
                rest = &rest[1..];
            }
        }

        skip_ws_and_comments(&mut rest);
    }

    Ok(graph)
}

fn starts_with_node_keyword(s: &str) -> bool {
    s.starts_with("group")
        || s.starts_with("rect")
        || s.starts_with("ellipse")
        || s.starts_with("path")
        || s.starts_with("text")
}

/// Check if input starts with `@identifier` followed by whitespace then `{`.
/// Distinguishes generic nodes (`@id { }`) from constraint lines (`@id -> ...`).
fn is_generic_node_start(s: &str) -> bool {
    let rest = match s.strip_prefix('@') {
        Some(r) => r,
        None => return false,
    };
    let after_id = rest.trim_start_matches(|c: char| c.is_alphanumeric() || c == '_');
    // Must have consumed at least one identifier char
    if after_id.len() == rest.len() {
        return false;
    }
    after_id.trim_start().starts_with('{')
}

/// Internal representation during parsing before inserting into graph.
#[derive(Debug)]
struct ParsedNode {
    id: NodeId,
    kind: NodeKind,
    style: Style,
    use_styles: Vec<NodeId>,
    constraints: Vec<Constraint>,
    animations: Vec<AnimKeyframe>,
    annotations: Vec<Annotation>,
    children: Vec<ParsedNode>,
}

fn insert_node_recursive(
    graph: &mut SceneGraph,
    parent: petgraph::graph::NodeIndex,
    parsed: ParsedNode,
) {
    let mut node = SceneNode::new(parsed.id, parsed.kind);
    node.style = parsed.style;
    node.use_styles.extend(parsed.use_styles);
    node.constraints.extend(parsed.constraints);
    node.animations.extend(parsed.animations);
    node.annotations = parsed.annotations;

    let idx = graph.add_node(parent, node);

    for child in parsed.children {
        insert_node_recursive(graph, idx, child);
    }
}

// ─── Low-level parsers ──────────────────────────────────────────────────

fn skip_ws_and_comments(input: &mut &str) {
    loop {
        let before = *input;
        // Skip whitespace manually
        *input = input.trim_start();
        if input.starts_with('#') {
            // ## is an annotation — don't skip it
            if input.starts_with("##") {
                break;
            }
            // Regular comment — skip to end of line
            if let Some(pos) = input.find('\n') {
                *input = &input[pos + 1..];
            } else {
                *input = "";
            }
            continue;
        }
        if *input == before {
            break;
        }
    }
}

/// Consume optional whitespace (concrete error type avoids inference issues).
fn skip_space(input: &mut &str) {
    use winnow::ascii::space0;
    let _: Result<&str, winnow::error::ErrMode<ContextError>> = space0.parse_next(input);
}

fn parse_identifier<'a>(input: &mut &'a str) -> ModalResult<&'a str> {
    take_while(1.., |c: char| c.is_alphanumeric() || c == '_').parse_next(input)
}

fn parse_node_id(input: &mut &str) -> ModalResult<NodeId> {
    preceded('@', parse_identifier)
        .map(NodeId::intern)
        .parse_next(input)
}

fn parse_hex_color(input: &mut &str) -> ModalResult<Color> {
    let _ = '#'.parse_next(input)?;
    let hex_digits: &str = take_while(1..=8, |c: char| c.is_ascii_hexdigit()).parse_next(input)?;
    let hex_str = format!("#{hex_digits}");
    Color::from_hex(&hex_str).ok_or_else(|| winnow::error::ErrMode::Backtrack(ContextError::new()))
}

fn parse_number(input: &mut &str) -> ModalResult<f32> {
    let start = *input;
    if input.starts_with('-') {
        *input = &input[1..];
    }
    let _ = take_while(1.., |c: char| c.is_ascii_digit()).parse_next(input)?;
    if input.starts_with('.') {
        *input = &input[1..];
        let _ =
            take_while::<_, _, ContextError>(0.., |c: char| c.is_ascii_digit()).parse_next(input);
    }
    let matched = &start[..start.len() - input.len()];
    matched
        .parse::<f32>()
        .map_err(|_| winnow::error::ErrMode::Backtrack(ContextError::new()))
}

fn parse_quoted_string<'a>(input: &mut &'a str) -> ModalResult<&'a str> {
    delimited('"', take_till(0.., '"'), '"').parse_next(input)
}

fn skip_opt_separator(input: &mut &str) {
    if input.starts_with(';') || input.starts_with('\n') {
        *input = &input[1..];
    }
}

// ─── Annotation parser ──────────────────────────────────────────────────

/// Parse a `##` annotation line into an `Annotation`.
fn parse_annotation(input: &mut &str) -> ModalResult<Annotation> {
    let _ = "##".parse_next(input)?;
    skip_space(input);

    // Try typed annotations: `keyword: value`
    let checkpoint = *input;
    if let Ok(keyword) = parse_identifier.parse_next(input) {
        skip_space(input);
        if input.starts_with(':') {
            let _ = ':'.parse_next(input)?;
            skip_space(input);

            let value = if input.starts_with('"') {
                parse_quoted_string
                    .map(|s| s.to_string())
                    .parse_next(input)?
            } else {
                let v: &str = take_till(0.., |c: char| c == '\n' || c == ';').parse_next(input)?;
                v.trim().to_string()
            };

            let ann = match keyword {
                "accept" => Annotation::Accept(value),
                "status" => Annotation::Status(value),
                "priority" => Annotation::Priority(value),
                "tag" => Annotation::Tag(value),
                _ => Annotation::Description(format!("{keyword}: {value}")),
            };

            skip_opt_separator(input);
            return Ok(ann);
        }
        *input = checkpoint;
    } else {
        *input = checkpoint;
    }

    // Freeform description: `## "text"` or `## bare text`
    skip_space(input);
    let desc = if input.starts_with('"') {
        parse_quoted_string
            .map(|s| s.to_string())
            .parse_next(input)?
    } else {
        let v: &str = take_till(0.., |c: char| c == '\n').parse_next(input)?;
        v.trim().to_string()
    };

    skip_opt_separator(input);
    Ok(Annotation::Description(desc))
}

// ─── Style block parser ─────────────────────────────────────────────────

fn parse_style_block(input: &mut &str) -> ModalResult<(NodeId, Style)> {
    let _ = "style".parse_next(input)?;
    let _ = space1.parse_next(input)?;
    let name = parse_identifier.map(NodeId::intern).parse_next(input)?;
    skip_space(input);
    let _ = '{'.parse_next(input)?;

    let mut style = Style::default();
    skip_ws_and_comments(input);

    while !input.starts_with('}') {
        parse_style_property(input, &mut style)?;
        skip_ws_and_comments(input);
    }

    let _ = '}'.parse_next(input)?;
    Ok((name, style))
}

fn parse_style_property(input: &mut &str, style: &mut Style) -> ModalResult<()> {
    let prop_name = parse_identifier.parse_next(input)?;
    skip_space(input);
    let _ = ':'.parse_next(input)?;
    skip_space(input);

    match prop_name {
        "fill" => {
            style.fill = Some(Paint::Solid(parse_hex_color.parse_next(input)?));
        }
        "font" => {
            parse_font_value(input, style)?;
        }
        "corner" => {
            style.corner_radius = Some(parse_number.parse_next(input)?);
        }
        "opacity" => {
            style.opacity = Some(parse_number.parse_next(input)?);
        }
        _ => {
            let _ =
                take_till::<_, _, ContextError>(0.., |c: char| c == '\n' || c == ';' || c == '}')
                    .parse_next(input);
        }
    }

    skip_opt_separator(input);
    Ok(())
}

fn parse_font_value(input: &mut &str, style: &mut Style) -> ModalResult<()> {
    let mut font = style.font.clone().unwrap_or_default();

    if input.starts_with('"') {
        let family = parse_quoted_string.parse_next(input)?;
        font.family = family.to_string();
        skip_space(input);
    }

    if let Ok(n1) = parse_number.parse_next(input) {
        skip_space(input);
        if let Ok(n2) = parse_number.parse_next(input) {
            font.weight = n1 as u16;
            font.size = n2;
        } else {
            font.size = n1;
        }
    }

    style.font = Some(font);
    Ok(())
}

// ─── Node parser ─────────────────────────────────────────────────────────

fn parse_node(input: &mut &str) -> ModalResult<ParsedNode> {
    // Type keyword is optional — `@id { }` creates a Generic node
    let kind_str = if input.starts_with('@') {
        "generic"
    } else {
        alt((
            "group".value("group"),
            "rect".value("rect"),
            "ellipse".value("ellipse"),
            "path".value("path"),
            "text".value("text"),
        ))
        .parse_next(input)?
    };

    skip_space(input);

    let id = if input.starts_with('@') {
        parse_node_id.parse_next(input)?
    } else {
        NodeId::anonymous()
    };

    skip_space(input);

    let inline_text = if kind_str == "text" && input.starts_with('"') {
        Some(
            parse_quoted_string
                .map(|s| s.to_string())
                .parse_next(input)?,
        )
    } else {
        None
    };

    skip_space(input);
    let _ = '{'.parse_next(input)?;

    let mut style = Style::default();
    let mut use_styles = Vec::new();
    let mut constraints = Vec::new();
    let mut animations = Vec::new();
    let mut annotations = Vec::new();
    let mut children = Vec::new();
    let mut width: Option<f32> = None;
    let mut height: Option<f32> = None;
    let mut layout = LayoutMode::Free;

    skip_ws_and_comments(input);

    while !input.starts_with('}') {
        if input.starts_with("##") {
            annotations.push(parse_annotation.parse_next(input)?);
        } else if starts_with_child_node(input) {
            children.push(parse_node.parse_next(input)?);
        } else if input.starts_with("anim") {
            animations.push(parse_anim_block.parse_next(input)?);
        } else {
            parse_node_property(
                input,
                &mut style,
                &mut use_styles,
                &mut constraints,
                &mut width,
                &mut height,
                &mut layout,
            )?;
        }
        skip_ws_and_comments(input);
    }

    let _ = '}'.parse_next(input)?;

    let kind = match kind_str {
        "group" => NodeKind::Group { layout },
        "rect" => NodeKind::Rect {
            width: width.unwrap_or(100.0),
            height: height.unwrap_or(100.0),
        },
        "ellipse" => NodeKind::Ellipse {
            rx: width.unwrap_or(50.0),
            ry: height.unwrap_or(50.0),
        },
        "text" => NodeKind::Text {
            content: inline_text.unwrap_or_default(),
        },
        "path" => NodeKind::Path {
            commands: Vec::new(),
        },
        "generic" => NodeKind::Generic,
        _ => unreachable!(),
    };

    Ok(ParsedNode {
        id,
        kind,
        style,
        use_styles,
        constraints,
        animations,
        annotations,
        children,
    })
}

/// Check if the current position starts a child node keyword followed by
/// a space, @, {, or " (not a property name that happens to start with a keyword).
fn starts_with_child_node(input: &str) -> bool {
    // Generic nodes start with @id {
    if is_generic_node_start(input) {
        return true;
    }
    let keywords = &[
        ("group", 5),
        ("rect", 4),
        ("ellipse", 7),
        ("path", 4),
        ("text", 4),
    ];
    for &(keyword, len) in keywords {
        if input.starts_with(keyword) {
            if keyword == "text" && input.get(len..).is_some_and(|s| s.starts_with('_')) {
                continue; // e.g. "text_align" is a property, not a text node
            }
            if let Some(after) = input.get(len..)
                && after.starts_with(|c: char| {
                    c == ' ' || c == '\t' || c == '@' || c == '{' || c == '"'
                })
            {
                return true;
            }
        }
    }
    false
}

fn parse_node_property(
    input: &mut &str,
    style: &mut Style,
    use_styles: &mut Vec<NodeId>,
    _constraints: &mut [Constraint],
    width: &mut Option<f32>,
    height: &mut Option<f32>,
    layout: &mut LayoutMode,
) -> ModalResult<()> {
    let prop_name = parse_identifier.parse_next(input)?;
    skip_space(input);
    let _ = ':'.parse_next(input)?;
    skip_space(input);

    match prop_name {
        "w" | "width" => {
            *width = Some(parse_number.parse_next(input)?);
            skip_space(input);
            if input.starts_with("h:") || input.starts_with("h :") {
                let _ = "h".parse_next(input)?;
                skip_space(input);
                let _ = ':'.parse_next(input)?;
                skip_space(input);
                *height = Some(parse_number.parse_next(input)?);
            }
        }
        "h" | "height" => {
            *height = Some(parse_number.parse_next(input)?);
        }
        "fill" => {
            style.fill = Some(Paint::Solid(parse_hex_color.parse_next(input)?));
        }
        "bg" => {
            style.fill = Some(Paint::Solid(parse_hex_color.parse_next(input)?));
            loop {
                skip_space(input);
                if input.starts_with("corner=") {
                    let _ = "corner=".parse_next(input)?;
                    style.corner_radius = Some(parse_number.parse_next(input)?);
                } else if input.starts_with("shadow=(") {
                    let _ = "shadow=(".parse_next(input)?;
                    let ox = parse_number.parse_next(input)?;
                    let _ = ','.parse_next(input)?;
                    let oy = parse_number.parse_next(input)?;
                    let _ = ','.parse_next(input)?;
                    let blur = parse_number.parse_next(input)?;
                    let _ = ','.parse_next(input)?;
                    let color = parse_hex_color.parse_next(input)?;
                    let _ = ')'.parse_next(input)?;
                    style.shadow = Some(Shadow {
                        offset_x: ox,
                        offset_y: oy,
                        blur,
                        color,
                    });
                } else {
                    break;
                }
            }
        }
        "stroke" => {
            let color = parse_hex_color.parse_next(input)?;
            let _ = space1.parse_next(input)?;
            let w = parse_number.parse_next(input)?;
            style.stroke = Some(Stroke {
                paint: Paint::Solid(color),
                width: w,
                ..Stroke::default()
            });
        }
        "corner" => {
            style.corner_radius = Some(parse_number.parse_next(input)?);
        }
        "opacity" => {
            style.opacity = Some(parse_number.parse_next(input)?);
        }
        "use" => {
            use_styles.push(parse_identifier.map(NodeId::intern).parse_next(input)?);
        }
        "font" => {
            parse_font_value(input, style)?;
        }
        "layout" => {
            let mode_str = parse_identifier.parse_next(input)?;
            skip_space(input);
            let mut gap = 0.0f32;
            let mut pad = 0.0f32;
            loop {
                skip_space(input);
                if input.starts_with("gap=") {
                    let _ = "gap=".parse_next(input)?;
                    gap = parse_number.parse_next(input)?;
                } else if input.starts_with("pad=") {
                    let _ = "pad=".parse_next(input)?;
                    pad = parse_number.parse_next(input)?;
                } else if input.starts_with("cols=") {
                    let _ = "cols=".parse_next(input)?;
                    let _ = parse_number.parse_next(input)?;
                } else {
                    break;
                }
            }
            *layout = match mode_str {
                "column" => LayoutMode::Column { gap, pad },
                "row" => LayoutMode::Row { gap, pad },
                "grid" => LayoutMode::Grid { cols: 2, gap, pad },
                _ => LayoutMode::Free,
            };
        }
        _ => {
            let _ =
                take_till::<_, _, ContextError>(0.., |c: char| c == '\n' || c == ';' || c == '}')
                    .parse_next(input);
        }
    }

    skip_opt_separator(input);
    Ok(())
}

// ─── Animation block parser ─────────────────────────────────────────────

fn parse_anim_block(input: &mut &str) -> ModalResult<AnimKeyframe> {
    let _ = "anim".parse_next(input)?;
    let _ = space1.parse_next(input)?;
    let _ = ':'.parse_next(input)?;
    let trigger_str = parse_identifier.parse_next(input)?;
    let trigger = match trigger_str {
        "hover" => AnimTrigger::Hover,
        "press" => AnimTrigger::Press,
        "enter" => AnimTrigger::Enter,
        other => AnimTrigger::Custom(other.to_string()),
    };

    skip_space(input);
    let _ = '{'.parse_next(input)?;

    let mut props = AnimProperties::default();
    let mut duration_ms = 300u32;
    let mut easing = Easing::EaseInOut;

    skip_ws_and_comments(input);

    while !input.starts_with('}') {
        let prop = parse_identifier.parse_next(input)?;
        skip_space(input);
        let _ = ':'.parse_next(input)?;
        skip_space(input);

        match prop {
            "fill" => {
                props.fill = Some(Paint::Solid(parse_hex_color.parse_next(input)?));
            }
            "opacity" => {
                props.opacity = Some(parse_number.parse_next(input)?);
            }
            "scale" => {
                props.scale = Some(parse_number.parse_next(input)?);
            }
            "rotate" => {
                props.rotate = Some(parse_number.parse_next(input)?);
            }
            "ease" => {
                let ease_name = parse_identifier.parse_next(input)?;
                easing = match ease_name {
                    "linear" => Easing::Linear,
                    "ease_in" | "easeIn" => Easing::EaseIn,
                    "ease_out" | "easeOut" => Easing::EaseOut,
                    "ease_in_out" | "easeInOut" => Easing::EaseInOut,
                    "spring" => Easing::Spring,
                    _ => Easing::EaseInOut,
                };
                skip_space(input);
                if let Ok(n) = parse_number.parse_next(input) {
                    duration_ms = n as u32;
                    if input.starts_with("ms") {
                        *input = &input[2..];
                    }
                }
            }
            _ => {
                let _ = take_till::<_, _, ContextError>(0.., |c: char| {
                    c == '\n' || c == ';' || c == '}'
                })
                .parse_next(input);
            }
        }

        skip_opt_separator(input);
        skip_ws_and_comments(input);
    }

    let _ = '}'.parse_next(input)?;

    Ok(AnimKeyframe {
        trigger,
        duration_ms,
        easing,
        properties: props,
    })
}

// ─── Edge block parser ─────────────────────────────────────────────────

fn parse_edge_block(input: &mut &str) -> ModalResult<Edge> {
    let _ = "edge".parse_next(input)?;
    let _ = space1.parse_next(input)?;

    let id = if input.starts_with('@') {
        parse_node_id.parse_next(input)?
    } else {
        NodeId::anonymous()
    };

    skip_space(input);
    let _ = '{'.parse_next(input)?;

    let mut from = None;
    let mut to = None;
    let mut label = None;
    let mut style = Style::default();
    let mut use_styles = Vec::new();
    let mut arrow = ArrowKind::None;
    let mut curve = CurveKind::Straight;
    let mut annotations = Vec::new();
    let mut animations = Vec::new();
    let mut flow = None;

    skip_ws_and_comments(input);

    while !input.starts_with('}') {
        if input.starts_with("##") {
            annotations.push(parse_annotation.parse_next(input)?);
        } else if input.starts_with("anim") {
            animations.push(parse_anim_block.parse_next(input)?);
        } else {
            let prop = parse_identifier.parse_next(input)?;
            skip_space(input);
            let _ = ':'.parse_next(input)?;
            skip_space(input);

            match prop {
                "from" => {
                    from = Some(parse_node_id.parse_next(input)?);
                }
                "to" => {
                    to = Some(parse_node_id.parse_next(input)?);
                }
                "label" => {
                    label = Some(
                        parse_quoted_string
                            .map(|s| s.to_string())
                            .parse_next(input)?,
                    );
                }
                "stroke" => {
                    let color = parse_hex_color.parse_next(input)?;
                    skip_space(input);
                    let w = parse_number.parse_next(input).unwrap_or(1.0);
                    style.stroke = Some(Stroke {
                        paint: Paint::Solid(color),
                        width: w,
                        ..Stroke::default()
                    });
                }
                "arrow" => {
                    let kind = parse_identifier.parse_next(input)?;
                    arrow = match kind {
                        "none" => ArrowKind::None,
                        "start" => ArrowKind::Start,
                        "end" => ArrowKind::End,
                        "both" => ArrowKind::Both,
                        _ => ArrowKind::None,
                    };
                }
                "curve" => {
                    let kind = parse_identifier.parse_next(input)?;
                    curve = match kind {
                        "straight" => CurveKind::Straight,
                        "smooth" => CurveKind::Smooth,
                        "step" => CurveKind::Step,
                        _ => CurveKind::Straight,
                    };
                }
                "use" => {
                    use_styles.push(parse_identifier.map(NodeId::intern).parse_next(input)?);
                }
                "opacity" => {
                    style.opacity = Some(parse_number.parse_next(input)?);
                }
                "flow" => {
                    let kind_str = parse_identifier.parse_next(input)?;
                    let kind = match kind_str {
                        "pulse" => FlowKind::Pulse,
                        "dash" => FlowKind::Dash,
                        _ => FlowKind::Pulse,
                    };
                    skip_space(input);
                    let dur = parse_number.parse_next(input).unwrap_or(800.0) as u32;
                    if input.starts_with("ms") {
                        *input = &input[2..];
                    }
                    flow = Some(FlowAnim {
                        kind,
                        duration_ms: dur,
                    });
                }
                _ => {
                    let _ = take_till::<_, _, ContextError>(0.., |c: char| {
                        c == '\n' || c == ';' || c == '}'
                    })
                    .parse_next(input);
                }
            }

            skip_opt_separator(input);
        }
        skip_ws_and_comments(input);
    }

    let _ = '}'.parse_next(input)?;

    // Default stroke if none provided
    if style.stroke.is_none() {
        style.stroke = Some(Stroke {
            paint: Paint::Solid(Color::rgba(0.42, 0.44, 0.5, 1.0)),
            width: 1.5,
            ..Stroke::default()
        });
    }

    Ok(Edge {
        id,
        from: from.unwrap_or_else(|| NodeId::intern("_missing")),
        to: to.unwrap_or_else(|| NodeId::intern("_missing")),
        label,
        style,
        use_styles: use_styles.into(),
        arrow,
        curve,
        annotations,
        animations: animations.into(),
        flow,
    })
}

// ─── Constraint line parser ──────────────────────────────────────────────

fn parse_constraint_line(input: &mut &str) -> ModalResult<(NodeId, Constraint)> {
    let node_id = parse_node_id.parse_next(input)?;
    skip_space(input);
    let _ = "->".parse_next(input)?;
    skip_space(input);

    let constraint_type = parse_identifier.parse_next(input)?;
    skip_space(input);
    let _ = ':'.parse_next(input)?;
    skip_space(input);

    let constraint = match constraint_type {
        "center_in" => Constraint::CenterIn(NodeId::intern(parse_identifier.parse_next(input)?)),
        "offset" => {
            let from = parse_node_id.parse_next(input)?;
            let _ = space1.parse_next(input)?;
            let dx = parse_number.parse_next(input)?;
            skip_space(input);
            let _ = ','.parse_next(input)?;
            skip_space(input);
            let dy = parse_number.parse_next(input)?;
            Constraint::Offset { from, dx, dy }
        }
        "fill_parent" => {
            let pad = opt(parse_number).parse_next(input)?.unwrap_or(0.0);
            Constraint::FillParent { pad }
        }
        "absolute" => {
            let x = parse_number.parse_next(input)?;
            skip_space(input);
            let _ = ','.parse_next(input)?;
            skip_space(input);
            let y = parse_number.parse_next(input)?;
            Constraint::Absolute { x, y }
        }
        _ => {
            let _ = take_till::<_, _, ContextError>(0.., '\n').parse_next(input);
            Constraint::Absolute { x: 0.0, y: 0.0 }
        }
    };

    if input.starts_with('\n') {
        *input = &input[1..];
    }
    Ok((node_id, constraint))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_minimal_document() {
        let input = r#"
# Comment
rect @box {
  w: 100
  h: 50
  fill: #FF0000
}
"#;
        let graph = parse_document(input).expect("parse failed");
        let node = graph
            .get_by_id(NodeId::intern("box"))
            .expect("node not found");

        match &node.kind {
            NodeKind::Rect { width, height } => {
                assert_eq!(*width, 100.0);
                assert_eq!(*height, 50.0);
            }
            _ => panic!("expected Rect"),
        }
        assert!(node.style.fill.is_some());
    }

    #[test]
    fn parse_style_and_use() {
        let input = r#"
style accent {
  fill: #6C5CE7
}

rect @btn {
  w: 200
  h: 48
  use: accent
}
"#;
        let graph = parse_document(input).expect("parse failed");
        assert!(graph.styles.contains_key(&NodeId::intern("accent")));
        let btn = graph.get_by_id(NodeId::intern("btn")).unwrap();
        assert_eq!(btn.use_styles.len(), 1);
    }

    #[test]
    fn parse_nested_group() {
        let input = r#"
group @form {
  layout: column gap=16 pad=32

  text @title "Hello" {
    fill: #333333
  }

  rect @field {
    w: 280
    h: 44
  }
}
"#;
        let graph = parse_document(input).expect("parse failed");
        let form_idx = graph.index_of(NodeId::intern("form")).unwrap();
        let children = graph.children(form_idx);
        assert_eq!(children.len(), 2);
    }

    #[test]
    fn parse_animation() {
        let input = r#"
rect @btn {
  w: 100
  h: 40
  fill: #6C5CE7

  anim :hover {
    fill: #5A4BD1
    scale: 1.02
    ease: spring 300ms
  }
}
"#;
        let graph = parse_document(input).expect("parse failed");
        let btn = graph.get_by_id(NodeId::intern("btn")).unwrap();
        assert_eq!(btn.animations.len(), 1);
        assert_eq!(btn.animations[0].trigger, AnimTrigger::Hover);
        assert_eq!(btn.animations[0].duration_ms, 300);
    }

    #[test]
    fn parse_constraint() {
        let input = r#"
rect @box {
  w: 100
  h: 100
}

@box -> center_in: canvas
"#;
        let graph = parse_document(input).expect("parse failed");
        let node = graph.get_by_id(NodeId::intern("box")).unwrap();
        assert_eq!(node.constraints.len(), 1);
        match &node.constraints[0] {
            Constraint::CenterIn(target) => assert_eq!(target.as_str(), "canvas"),
            _ => panic!("expected CenterIn"),
        }
    }

    #[test]
    fn parse_inline_wh() {
        let input = r#"
rect @box {
  w: 280 h: 44
  fill: #FF0000
}
"#;
        let graph = parse_document(input).expect("parse failed");
        let node = graph.get_by_id(NodeId::intern("box")).unwrap();
        match &node.kind {
            NodeKind::Rect { width, height } => {
                assert_eq!(*width, 280.0);
                assert_eq!(*height, 44.0);
            }
            _ => panic!("expected Rect"),
        }
    }

    #[test]
    fn parse_empty_document() {
        let input = "";
        let graph = parse_document(input).expect("empty doc should parse");
        assert_eq!(graph.children(graph.root).len(), 0);
    }

    #[test]
    fn parse_comments_only() {
        let input = "# This is a comment\n# Another comment\n";
        let graph = parse_document(input).expect("comments-only should parse");
        assert_eq!(graph.children(graph.root).len(), 0);
    }

    #[test]
    fn parse_anonymous_node() {
        let input = "rect { w: 50 h: 50 }";
        let graph = parse_document(input).expect("anonymous node should parse");
        assert_eq!(graph.children(graph.root).len(), 1);
    }

    #[test]
    fn parse_ellipse() {
        let input = r#"
ellipse @dot {
  w: 30 h: 30
  fill: #FF5733
}
"#;
        let graph = parse_document(input).expect("ellipse should parse");
        let dot = graph.get_by_id(NodeId::intern("dot")).unwrap();
        match &dot.kind {
            NodeKind::Ellipse { rx, ry } => {
                assert_eq!(*rx, 30.0);
                assert_eq!(*ry, 30.0);
            }
            _ => panic!("expected Ellipse"),
        }
    }

    #[test]
    fn parse_text_with_content() {
        let input = r#"
text @greeting "Hello World" {
  font: "Inter" 600 24
  fill: #1A1A2E
}
"#;
        let graph = parse_document(input).expect("text should parse");
        let node = graph.get_by_id(NodeId::intern("greeting")).unwrap();
        match &node.kind {
            NodeKind::Text { content } => {
                assert_eq!(content, "Hello World");
            }
            _ => panic!("expected Text"),
        }
        assert!(node.style.font.is_some());
        let font = node.style.font.as_ref().unwrap();
        assert_eq!(font.family, "Inter");
        assert_eq!(font.weight, 600);
        assert_eq!(font.size, 24.0);
    }

    #[test]
    fn parse_stroke_property() {
        let input = r#"
rect @bordered {
  w: 100 h: 100
  stroke: #DDDDDD 2
}
"#;
        let graph = parse_document(input).expect("stroke should parse");
        let node = graph.get_by_id(NodeId::intern("bordered")).unwrap();
        assert!(node.style.stroke.is_some());
        let stroke = node.style.stroke.as_ref().unwrap();
        assert_eq!(stroke.width, 2.0);
    }

    #[test]
    fn parse_multiple_constraints() {
        let input = r#"
rect @a { w: 100 h: 100 }
rect @b { w: 50 h: 50 }
@a -> center_in: canvas
@a -> absolute: 10, 20
"#;
        let graph = parse_document(input).expect("multiple constraints should parse");
        let node = graph.get_by_id(NodeId::intern("a")).unwrap();
        // The last constraint wins in layout, but both should be stored
        assert_eq!(node.constraints.len(), 2);
    }

    #[test]
    fn parse_comments_between_nodes() {
        let input = r#"
# First node
rect @a { w: 100 h: 100 }
# Second node
rect @b { w: 200 h: 200 }
"#;
        let graph = parse_document(input).expect("interleaved comments should parse");
        assert_eq!(graph.children(graph.root).len(), 2);
    }
}
