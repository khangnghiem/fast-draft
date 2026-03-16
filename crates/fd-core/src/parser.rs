//! Parser for the FD text format → SceneGraph.
//!
//! Built on `winnow` 0.7 for efficient, streaming parsing.
//! Handles: comments, style definitions, imports, node declarations
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

    // Collect any leading comments before the first declaration.
    let mut pending_comments = collect_leading_comments(&mut rest);

    while !rest.is_empty() {
        let line = line_number(input, rest);
        let end = {
            let max = rest.len().min(40);
            // Find a valid UTF-8 char boundary at or before `max`
            let mut e = max;
            while e > 0 && !rest.is_char_boundary(e) {
                e -= 1;
            }
            e
        };
        let ctx = &rest[..end];

        if rest.starts_with("import ") {
            let import = parse_import_line
                .parse_next(&mut rest)
                .map_err(|e| format!("line {line}: import error — expected `import \"path\" as name`, got `{ctx}…`: {e}"))?;
            graph.imports.push(import);
            pending_comments.clear();
        } else if rest.starts_with("style ") || rest.starts_with("theme ") {
            let (name, style) = parse_style_block
                .parse_next(&mut rest)
                .map_err(|e| format!("line {line}: style/theme error — expected `style name {{ props }}`, got `{ctx}…`: {e}"))?;
            graph.define_style(name, style);
            pending_comments.clear();
        } else if rest.starts_with("spec ")
            || rest.starts_with("spec{")
            || rest.starts_with("note ")
            || rest.starts_with("note{")
        {
            // Top-level note/spec blocks are ignored (they only apply inside nodes)
            let _ = parse_note_block.parse_next(&mut rest);
            pending_comments.clear();
        } else if rest.starts_with('@') {
            if is_generic_node_start(rest) {
                let mut node_data = parse_node.parse_next(&mut rest).map_err(|e| {
                    format!("line {line}: node error — expected `@id {{ ... }}`, got `{ctx}…`: {e}")
                })?;
                node_data.comments = std::mem::take(&mut pending_comments);
                let root = graph.root;
                insert_node_recursive(&mut graph, root, node_data);
            } else {
                let (node_id, constraint) = parse_constraint_line
                    .parse_next(&mut rest)
                    .map_err(|e| format!("line {line}: constraint error — expected `@id -> type: value`, got `{ctx}…`: {e}"))?;
                if let Some(node) = graph.get_by_id_mut(node_id) {
                    node.constraints.push(constraint);
                }
                pending_comments.clear();
            }
        } else if rest.starts_with("edge_defaults ") || rest.starts_with("edge_defaults{") {
            let defaults = parse_edge_defaults_block
                .parse_next(&mut rest)
                .map_err(|e| format!("line {line}: edge_defaults error — expected `edge_defaults {{ props }}`, got `{ctx}…`: {e}"))?;
            graph.edge_defaults = Some(defaults);
            pending_comments.clear();
        } else if rest.starts_with("edge ") {
            let (edge, text_child_data) = parse_edge_block
                .parse_next(&mut rest)
                .map_err(|e| format!("line {line}: edge error — expected `edge @id {{ from: @a to: @b }}`, got `{ctx}…`: {e}"))?;
            // Insert text child node into graph if label: created one
            if let Some((text_id, content)) = text_child_data {
                let text_node = crate::model::SceneNode {
                    id: text_id,
                    kind: crate::model::NodeKind::Text {
                        content,
                        max_width: None,
                    },
                    props: crate::model::Properties::default(),
                    use_styles: Default::default(),
                    constraints: Default::default(),
                    note: None,
                    animations: Default::default(),
                    comments: Vec::new(),
                    place: None,
                    locked: false,
                };
                let idx = graph.graph.add_node(text_node);
                graph.graph.add_edge(graph.root, idx, ());
                graph.id_index.insert(text_id, idx);
            }
            graph.edges.push(edge);
            pending_comments.clear();
        } else if starts_with_node_keyword(rest) {
            let mut node_data = parse_node.parse_next(&mut rest).map_err(|e| {
                format!(
                    "line {line}: node error — expected `kind @id {{ ... }}`, got `{ctx}…`: {e}"
                )
            })?;
            node_data.comments = std::mem::take(&mut pending_comments);
            let root = graph.root;
            insert_node_recursive(&mut graph, root, node_data);
        } else {
            // Skip unknown line
            let _ = take_till::<_, _, ContextError>(0.., '\n').parse_next(&mut rest);
            if rest.starts_with('\n') {
                rest = &rest[1..];
            }
            pending_comments.clear();
        }

        // Collect comments between top-level declarations.
        // They will be attached to the *next* node parsed.
        let more = collect_leading_comments(&mut rest);
        pending_comments.extend(more);
    }

    Ok(graph)
}

/// Compute the 1-based line number of `remaining` within `full_input`.
fn line_number(full_input: &str, remaining: &str) -> usize {
    let consumed = full_input.len() - remaining.len();
    full_input[..consumed].matches('\n').count() + 1
}

fn starts_with_node_keyword(s: &str) -> bool {
    s.starts_with("group")
        || s.starts_with("frame")
        || s.starts_with("rect")
        || s.starts_with("ellipse")
        || s.starts_with("path")
        || s.starts_with("image")
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
    props: Properties,
    use_styles: Vec<NodeId>,
    constraints: Vec<Constraint>,
    animations: Vec<AnimKeyframe>,
    note: Option<String>,
    /// Comments that appeared before this node's opening `{` in the source.
    comments: Vec<String>,
    children: Vec<ParsedNode>,
    /// 9-position placement within parent.
    place: Option<(HPlace, VPlace)>,
    /// Whether this node is locked (prevents move/resize/delete).
    locked: bool,
}

fn insert_node_recursive(
    graph: &mut SceneGraph,
    parent: petgraph::graph::NodeIndex,
    parsed: ParsedNode,
) {
    let mut node = SceneNode::new(parsed.id, parsed.kind);
    node.props = parsed.props;
    node.use_styles.extend(parsed.use_styles);
    node.constraints.extend(parsed.constraints);
    node.animations.extend(parsed.animations);
    node.note = parsed.note;
    node.comments = parsed.comments;
    node.place = parsed.place;
    node.locked = parsed.locked;

    let idx = graph.add_node(parent, node);

    for child in parsed.children {
        insert_node_recursive(graph, idx, child);
    }
}

// ─── Import parser ──────────────────────────────────────────────────────

/// Parse `import "path.fd" as namespace`.
fn parse_import_line(input: &mut &str) -> ModalResult<Import> {
    let _ = "import".parse_next(input)?;
    let _ = space1.parse_next(input)?;
    let path = parse_quoted_string
        .map(|s| s.to_string())
        .parse_next(input)?;
    let _ = space1.parse_next(input)?;
    let _ = "as".parse_next(input)?;
    let _ = space1.parse_next(input)?;
    let namespace = parse_identifier.map(|s| s.to_string()).parse_next(input)?;
    skip_opt_separator(input);
    Ok(Import { path, namespace })
}

// ─── Low-level parsers ──────────────────────────────────────────────────

/// Section separators emitted automatically by the emitter.
/// These are skipped during parsing to avoid duplication on round-trip.
const SECTION_SEPARATORS: &[&str] = &[
    "─── Styles ───",
    "─── Themes ───",
    "─── Layout ───",
    "─── Constraints ───",
    "─── Flows ───",
];

/// Check if a comment body matches an emitter-generated section separator.
fn is_section_separator(text: &str) -> bool {
    SECTION_SEPARATORS.iter().any(|sep| text.contains(sep))
}

/// Collect leading whitespace and `# comment` lines, returning the comments.
/// Skips emitter-generated section separators to prevent duplication.
fn collect_leading_comments(input: &mut &str) -> Vec<String> {
    let mut comments = Vec::new();
    loop {
        // Skip pure whitespace (not newlines that separate nodes)
        let before = *input;
        *input = input.trim_start();
        if input.starts_with('#') {
            // Consume the comment line
            let end = input.find('\n').unwrap_or(input.len());
            let text = input[1..end].trim().to_string();
            *input = &input[end.min(input.len())..];
            if input.starts_with('\n') {
                *input = &input[1..];
            }
            // Skip section separators and [auto] doc-comments; collect everything else
            if !text.is_empty() && !is_section_separator(&text) && !text.starts_with("[auto]") {
                comments.push(text);
            }
            continue;
        }
        if *input == before {
            break;
        }
    }
    comments
}

/// Skip whitespace and comments without collecting them (used in style/anim blocks
/// where comments are rare and not worth attaching to a model element).
fn skip_ws_and_comments(input: &mut &str) {
    let _ = collect_leading_comments(input);
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
    Color::from_hex(hex_digits)
        .ok_or_else(|| winnow::error::ErrMode::Backtrack(ContextError::new()))
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

/// Strip an optional trailing `px` unit suffix (e.g. `320px` → `320`).
fn skip_px_suffix(input: &mut &str) {
    if input.starts_with("px") {
        *input = &input[2..];
    }
}

/// Parse a `note { ... }` block or inline `note "description"` into raw markdown.
/// Also accepts the legacy `spec` keyword for backward compatibility.
fn parse_note_block(input: &mut &str) -> ModalResult<String> {
    // Accept both `note` and legacy `spec`
    let _ = alt(("note", "spec")).parse_next(input)?;
    skip_space(input);

    // Inline shorthand: `note "description"`
    if input.starts_with('"') {
        let desc = parse_quoted_string
            .map(|s| s.to_string())
            .parse_next(input)?;
        skip_opt_separator(input);
        return Ok(desc);
    }

    // Block form: `note { ... }` — capture raw content with brace-depth counting
    let _ = '{'.parse_next(input)?;
    let mut depth = 1u32;
    let mut content_len = 0;
    for (i, ch) in input.char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    content_len = i;
                    break;
                }
            }
            _ => {}
        }
    }
    let raw = &input[..content_len];
    *input = &input[content_len..];
    let _ = '}'.parse_next(input)?;

    // Trim leading/trailing whitespace but preserve internal formatting
    let trimmed = dedent_note_content(raw);
    Ok(trimmed)
}

/// Dedent note block content: remove the common leading whitespace from all lines.
fn dedent_note_content(raw: &str) -> String {
    let trimmed = raw.trim_matches('\n');
    if trimmed.is_empty() {
        return String::new();
    }
    // Find minimum indentation across non-empty lines
    let min_indent = trimmed
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.len() - l.trim_start().len())
        .min()
        .unwrap_or(0);
    // Strip that prefix from each line
    trimmed
        .lines()
        .map(|l| {
            if l.len() >= min_indent {
                &l[min_indent..]
            } else {
                l.trim_start()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

// ─── Style block parser ─────────────────────────────────────────────────

fn parse_style_block(input: &mut &str) -> ModalResult<(NodeId, Properties)> {
    let _ = alt(("theme", "style")).parse_next(input)?;
    let _ = space1.parse_next(input)?;
    let name = parse_identifier.map(NodeId::intern).parse_next(input)?;
    skip_space(input);
    let _ = '{'.parse_next(input)?;

    let mut style = Properties::default();
    skip_ws_and_comments(input);

    while !input.starts_with('}') {
        parse_style_property(input, &mut style)?;
        skip_ws_and_comments(input);
    }

    let _ = '}'.parse_next(input)?;
    Ok((name, style))
}

fn parse_style_property(input: &mut &str, style: &mut Properties) -> ModalResult<()> {
    let prop_name = parse_identifier.parse_next(input)?;
    skip_space(input);
    let _ = ':'.parse_next(input)?;
    skip_space(input);

    match prop_name {
        "fill" | "background" | "color" => {
            style.fill = Some(parse_paint(input)?);
        }
        "font" => {
            parse_font_value(input, style)?;
        }
        "corner" | "rounded" | "radius" => {
            style.corner_radius = Some(parse_number.parse_next(input)?);
            skip_px_suffix(input);
        }
        "opacity" => {
            style.opacity = Some(parse_number.parse_next(input)?);
        }
        "align" | "text_align" => {
            parse_align_value(input, style)?;
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

/// Map human-readable weight names to numeric values.
fn weight_name_to_number(name: &str) -> Option<u16> {
    match name {
        "thin" => Some(100),
        "extralight" | "extra_light" => Some(200),
        "light" => Some(300),
        "regular" | "normal" => Some(400),
        "medium" => Some(500),
        "semibold" | "semi_bold" => Some(600),
        "bold" => Some(700),
        "extrabold" | "extra_bold" => Some(800),
        "black" | "heavy" => Some(900),
        _ => None,
    }
}

fn parse_font_value(input: &mut &str, style: &mut Properties) -> ModalResult<()> {
    let mut font = style.font.clone().unwrap_or_default();

    if input.starts_with('"') {
        let family = parse_quoted_string.parse_next(input)?;
        font.family = family.to_string();
        skip_space(input);
    }

    // Try named weight first (e.g. bold, semibold), then numeric
    let saved = *input;
    if let Ok(name) = parse_identifier.parse_next(input) {
        if let Some(w) = weight_name_to_number(name) {
            font.weight = w;
            skip_space(input);
            if let Ok(size) = parse_number.parse_next(input) {
                font.size = size;
                skip_px_suffix(input);
            }
        } else {
            *input = saved; // not a weight name, restore
        }
    }

    // Fallback: numeric weight + size
    if *input == saved
        && let Ok(n1) = parse_number.parse_next(input)
    {
        skip_space(input);
        if let Ok(n2) = parse_number.parse_next(input) {
            font.weight = n1 as u16;
            font.size = n2;
            skip_px_suffix(input);
        } else {
            font.size = n1;
            skip_px_suffix(input);
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
            "frame".value("frame"),
            "rect".value("rect"),
            "ellipse".value("ellipse"),
            "path".value("path"),
            "image".value("image"),
            "text".value("text"),
        ))
        .parse_next(input)?
    };

    skip_space(input);

    let id = if input.starts_with('@') {
        parse_node_id.parse_next(input)?
    } else {
        NodeId::anonymous(kind_str)
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

    let mut style = Properties::default();
    let mut use_styles = Vec::new();
    let mut constraints = Vec::new();
    let mut animations = Vec::new();
    let mut note: Option<String> = None;
    let mut children = Vec::new();
    let mut width: Option<f32> = None;
    let mut height: Option<f32> = None;
    let mut layout = LayoutMode::Free { pad: 0.0 };
    let mut clip = false;
    let mut place: Option<(HPlace, VPlace)> = None;
    let mut locked = false;
    let mut path_commands: Vec<PathCmd> = Vec::new();
    let mut image_src: Option<String> = None;
    let mut image_fit = ImageFit::default();

    skip_ws_and_comments(input);

    while !input.starts_with('}') {
        if input.starts_with("spec ")
            || input.starts_with("spec{")
            || input.starts_with("note ")
            || input.starts_with("note{")
        {
            let content = parse_note_block.parse_next(input)?;
            // Multiple note blocks: append with newline separator
            note = Some(match note {
                Some(existing) => format!("{existing}\n\n{content}"),
                None => content,
            });
        } else if starts_with_child_node(input) && !matches!(kind_str, "text" | "path") {
            let mut child = parse_node.parse_next(input)?;
            // Any comments collected before this child are attached to it
            // (they were consumed by the preceding skip_ws_and_comments/collect call)
            child.comments = Vec::new(); // placeholder; child attaches its own leading comments
            children.push(child);
        } else if starts_with_child_node(input) {
            // Text/Path nodes are leaf-only — silently consume and discard
            // any nested node definitions to prevent parse errors.
            let _discarded = parse_node.parse_next(input)?;
        } else if input.starts_with("when") || input.starts_with("anim") {
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
                &mut clip,
                &mut place,
                &mut locked,
                &mut path_commands,
                &mut image_src,
                &mut image_fit,
            )?;
        }
        // Collect comments between items; they'll be attached to the *next* child node
        let _inner_comments = collect_leading_comments(input);
    }

    let _ = '}'.parse_next(input)?;

    let kind = match kind_str {
        "group" => NodeKind::Group, // Group is purely organizational — layout ignored
        "frame" => NodeKind::Frame {
            width: width.unwrap_or(200.0),
            height: height.unwrap_or(200.0),
            clip,
            layout,
        },
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
            max_width: width,
        },
        "path" => NodeKind::Path {
            commands: path_commands,
        },
        "image" => NodeKind::Image {
            source: ImageSource::File(image_src.unwrap_or_default()),
            width: width.unwrap_or(100.0),
            height: height.unwrap_or(100.0),
            fit: image_fit,
        },
        "generic" => NodeKind::Generic,
        _ => unreachable!(),
    };

    Ok(ParsedNode {
        id,
        kind,
        props: style,
        use_styles,
        constraints,
        animations,
        note,
        comments: Vec::new(),
        children,
        place,
        locked,
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
        ("frame", 5),
        ("rect", 4),
        ("ellipse", 7),
        ("path", 4),
        ("image", 5),
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

/// Map named colors to hex values.
fn named_color_to_hex(name: &str) -> Option<Color> {
    match name {
        "red" => Color::from_hex("#EF4444"),
        "orange" => Color::from_hex("#F97316"),
        "amber" | "yellow" => Color::from_hex("#F59E0B"),
        "lime" => Color::from_hex("#84CC16"),
        "green" => Color::from_hex("#22C55E"),
        "teal" => Color::from_hex("#14B8A6"),
        "cyan" => Color::from_hex("#06B6D4"),
        "blue" => Color::from_hex("#3B82F6"),
        "indigo" => Color::from_hex("#6366F1"),
        "purple" | "violet" => Color::from_hex("#8B5CF6"),
        "pink" => Color::from_hex("#EC4899"),
        "rose" => Color::from_hex("#F43F5E"),
        "white" => Color::from_hex("#FFFFFF"),
        "black" => Color::from_hex("#000000"),
        "gray" | "grey" => Color::from_hex("#6B7280"),
        "slate" => Color::from_hex("#64748B"),
        _ => None,
    }
}

/// Parse a `Paint` value: `#HEX`, named color, `linear(...)`, or `radial(...)`.
fn parse_paint(input: &mut &str) -> ModalResult<Paint> {
    if input.starts_with("linear(") {
        let _ = "linear(".parse_next(input)?;
        let angle = parse_number.parse_next(input)?;
        let _ = "deg".parse_next(input)?;
        let stops = parse_gradient_stops(input)?;
        let _ = ')'.parse_next(input)?;
        Ok(Paint::LinearGradient { angle, stops })
    } else if input.starts_with("radial(") {
        let _ = "radial(".parse_next(input)?;
        let stops = parse_gradient_stops(input)?;
        let _ = ')'.parse_next(input)?;
        Ok(Paint::RadialGradient { stops })
    } else if input.starts_with('#') {
        parse_hex_color.map(Paint::Solid).parse_next(input)
    } else {
        // Try named color (e.g. purple, red, blue)
        let saved = *input;
        if let Ok(name) = parse_identifier.parse_next(input) {
            if let Some(color) = named_color_to_hex(name) {
                return Ok(Paint::Solid(color));
            }
            *input = saved;
        }
        parse_hex_color.map(Paint::Solid).parse_next(input)
    }
}

/// Parse gradient stops: optional leading comma, then `#HEX offset` pairs separated by commas.
///
/// Handles both `linear(90deg, #HEX N, #HEX N)` (comma before first stop)
/// and `radial(#HEX N, #HEX N)` (no comma before first stop).
fn parse_gradient_stops(input: &mut &str) -> ModalResult<Vec<GradientStop>> {
    let mut stops = Vec::new();
    loop {
        skip_space(input);
        // Consume comma separator (required between stops, optional before first)
        if input.starts_with(',') {
            let _ = ','.parse_next(input)?;
            skip_space(input);
        }
        // Stop if we hit the closing paren or end of input
        if input.is_empty() || input.starts_with(')') {
            break;
        }
        // Try to parse a color; if it fails, we're done
        let Ok(color) = parse_hex_color.parse_next(input) else {
            break;
        };
        skip_space(input);
        let offset = parse_number.parse_next(input)?;
        stops.push(GradientStop { color, offset });
    }
    Ok(stops)
}

#[allow(clippy::too_many_arguments)]
fn parse_node_property(
    input: &mut &str,
    style: &mut Properties,
    use_styles: &mut Vec<NodeId>,
    constraints: &mut Vec<Constraint>,
    width: &mut Option<f32>,
    height: &mut Option<f32>,
    layout: &mut LayoutMode,
    clip: &mut bool,
    place: &mut Option<(HPlace, VPlace)>,
    locked: &mut bool,
    path_commands: &mut Vec<PathCmd>,
    image_src: &mut Option<String>,
    image_fit: &mut ImageFit,
) -> ModalResult<()> {
    let prop_name = parse_identifier.parse_next(input)?;
    skip_space(input);
    let _ = ':'.parse_next(input)?;
    skip_space(input);

    match prop_name {
        "x" => {
            let x_val = parse_number.parse_next(input)?;
            // Replace existing Position constraint if present, else push new
            if let Some(Constraint::Position { x, .. }) = constraints
                .iter_mut()
                .find(|c| matches!(c, Constraint::Position { .. }))
            {
                *x = x_val;
            } else {
                constraints.push(Constraint::Position { x: x_val, y: 0.0 });
            }
        }
        "y" => {
            let y_val = parse_number.parse_next(input)?;
            if let Some(Constraint::Position { y, .. }) = constraints
                .iter_mut()
                .find(|c| matches!(c, Constraint::Position { .. }))
            {
                *y = y_val;
            } else {
                constraints.push(Constraint::Position { x: 0.0, y: y_val });
            }
        }
        "w" | "width" => {
            *width = Some(parse_number.parse_next(input)?);
            skip_px_suffix(input);
            skip_space(input);
            if input.starts_with("h:") || input.starts_with("h :") {
                let _ = "h".parse_next(input)?;
                skip_space(input);
                let _ = ':'.parse_next(input)?;
                skip_space(input);
                *height = Some(parse_number.parse_next(input)?);
                skip_px_suffix(input);
            }
        }
        "h" | "height" => {
            *height = Some(parse_number.parse_next(input)?);
            skip_px_suffix(input);
        }
        "fill" | "background" | "color" => {
            style.fill = Some(parse_paint(input)?);
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
        "stroke" | "border" => {
            let color = parse_hex_color.parse_next(input)?;
            let _ = space1.parse_next(input)?;
            let w = parse_number.parse_next(input)?;
            style.stroke = Some(Stroke {
                paint: Paint::Solid(color),
                width: w,
                ..Stroke::default()
            });
        }
        "corner" | "rounded" | "radius" => {
            style.corner_radius = Some(parse_number.parse_next(input)?);
            skip_px_suffix(input);
        }
        "opacity" => {
            style.opacity = Some(parse_number.parse_next(input)?);
        }
        "align" | "text_align" => {
            parse_align_value(input, style)?;
        }
        "place" => {
            *place = Some(parse_place_value(input)?);
        }
        "locked" => {
            // locked: true — parse boolean value
            let val = parse_identifier.parse_next(input)?;
            *locked = val == "true";
        }
        "shadow" => {
            // shadow: (ox,oy,blur,#COLOR)  — colon already consumed by property parser
            skip_space(input);
            if input.starts_with('(') {
                let _ = '('.parse_next(input)?;
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
            }
        }
        "label" => {
            // Deprecated: label is now a text child node.
            // Skip the value to maintain backwards compatibility with old .fd files.
            if input.starts_with('"') {
                let _ = parse_quoted_string.parse_next(input)?;
            } else {
                let _ = take_till::<_, _, ContextError>(0.., |c: char| {
                    c == '\n' || c == ';' || c == '}'
                })
                .parse_next(input);
            }
        }
        "use" | "apply" => {
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
                _ => LayoutMode::Free { pad: 0.0 },
            };
        }
        "clip" => {
            let val = parse_identifier.parse_next(input)?;
            *clip = val == "true";
        }
        "pad" | "padding" => {
            // Standalone pad: N — sets padding on Free frames
            let val = parse_number.parse_next(input)?;
            match layout {
                LayoutMode::Free { pad } => *pad = val,
                LayoutMode::Column { pad, .. }
                | LayoutMode::Row { pad, .. }
                | LayoutMode::Grid { pad, .. } => *pad = val,
            }
        }
        "d" => {
            // Parse SVG-like path commands: M x y L x y C ... Z
            loop {
                skip_space(input);
                let at_end = input.is_empty()
                    || input.starts_with('\n')
                    || input.starts_with(';')
                    || input.starts_with('}');
                if at_end {
                    break;
                }
                let saved = *input;
                if let Ok(cmd_char) = take_while::<_, _, ContextError>(1..=1, |c: char| {
                    matches!(c, 'M' | 'L' | 'Q' | 'C' | 'Z')
                })
                .parse_next(input)
                {
                    skip_space(input);
                    match cmd_char {
                        "M" => {
                            let x = parse_number.parse_next(input)?;
                            skip_space(input);
                            let y = parse_number.parse_next(input)?;
                            path_commands.push(PathCmd::MoveTo(x, y));
                        }
                        "L" => {
                            let x = parse_number.parse_next(input)?;
                            skip_space(input);
                            let y = parse_number.parse_next(input)?;
                            path_commands.push(PathCmd::LineTo(x, y));
                        }
                        "Q" => {
                            let cx = parse_number.parse_next(input)?;
                            skip_space(input);
                            let cy = parse_number.parse_next(input)?;
                            skip_space(input);
                            let ex = parse_number.parse_next(input)?;
                            skip_space(input);
                            let ey = parse_number.parse_next(input)?;
                            path_commands.push(PathCmd::QuadTo(cx, cy, ex, ey));
                        }
                        "C" => {
                            let c1x = parse_number.parse_next(input)?;
                            skip_space(input);
                            let c1y = parse_number.parse_next(input)?;
                            skip_space(input);
                            let c2x = parse_number.parse_next(input)?;
                            skip_space(input);
                            let c2y = parse_number.parse_next(input)?;
                            skip_space(input);
                            let ex = parse_number.parse_next(input)?;
                            skip_space(input);
                            let ey = parse_number.parse_next(input)?;
                            path_commands.push(PathCmd::CubicTo(c1x, c1y, c2x, c2y, ex, ey));
                        }
                        "Z" => {
                            path_commands.push(PathCmd::Close);
                        }
                        _ => {
                            *input = saved;
                            break;
                        }
                    }
                } else {
                    *input = saved;
                    break;
                }
            }
        }
        "src" => {
            *image_src = Some(
                parse_quoted_string
                    .map(|s| s.to_string())
                    .parse_next(input)?,
            );
        }
        "fit" => {
            let val = parse_identifier.parse_next(input)?;
            *image_fit = match val {
                "cover" => ImageFit::Cover,
                "contain" => ImageFit::Contain,
                "fill" => ImageFit::Fill,
                "none" => ImageFit::None,
                _ => ImageFit::Cover,
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

// ─── Alignment value parser ──────────────────────────────────────────────

fn parse_align_value(input: &mut &str, style: &mut Properties) -> ModalResult<()> {
    use crate::model::{TextAlign, TextVAlign};

    let first = parse_identifier.parse_next(input)?;
    style.text_align = Some(match first {
        "left" => TextAlign::Left,
        "right" => TextAlign::Right,
        _ => TextAlign::Center, // "center" or unknown
    });

    // Check for optional vertical alignment
    skip_space(input);
    let at_end = input.is_empty()
        || input.starts_with('\n')
        || input.starts_with(';')
        || input.starts_with('}');
    if !at_end && let Ok(second) = parse_identifier.parse_next(input) {
        style.text_valign = Some(match second {
            "top" => TextVAlign::Top,
            "bottom" => TextVAlign::Bottom,
            _ => TextVAlign::Middle,
        });
    }

    Ok(())
}

// ─── Place value parser ──────────────────────────────────────────────────

fn parse_place_value(input: &mut &str) -> ModalResult<(HPlace, VPlace)> {
    use crate::model::{HPlace, VPlace};

    let first = parse_identifier.parse_next(input)?;

    // Check for compound hyphenated form: "top-left", "bottom-right", etc.
    if input.starts_with('-') {
        let saved = *input;
        *input = &input[1..]; // consume '-'
        if let Ok(second) = parse_identifier.parse_next(input) {
            match (first, second) {
                ("top", "left") => return Ok((HPlace::Left, VPlace::Top)),
                ("top", "right") => return Ok((HPlace::Right, VPlace::Top)),
                ("bottom", "left") => return Ok((HPlace::Left, VPlace::Bottom)),
                ("bottom", "right") => return Ok((HPlace::Right, VPlace::Bottom)),
                _ => *input = saved, // restore if unrecognized
            }
        } else {
            *input = saved;
        }
    }

    match first {
        "center" => {
            // Check if there's a second word (2-arg form: "center top")
            skip_space(input);
            let at_end = input.is_empty()
                || input.starts_with('\n')
                || input.starts_with(';')
                || input.starts_with('}');
            if !at_end && let Ok(second) = parse_identifier.parse_next(input) {
                let v = match second {
                    "top" => VPlace::Top,
                    "bottom" => VPlace::Bottom,
                    _ => VPlace::Middle,
                };
                return Ok((HPlace::Center, v));
            }
            Ok((HPlace::Center, VPlace::Middle))
        }
        "top" => Ok((HPlace::Center, VPlace::Top)),
        "bottom" => Ok((HPlace::Center, VPlace::Bottom)),
        _ => {
            // 2-arg form: "left middle", "right top", etc.
            let h = match first {
                "left" => HPlace::Left,
                "right" => HPlace::Right,
                _ => HPlace::Center,
            };

            skip_space(input);
            let at_end = input.is_empty()
                || input.starts_with('\n')
                || input.starts_with(';')
                || input.starts_with('}');
            if !at_end && let Ok(second) = parse_identifier.parse_next(input) {
                let v = match second {
                    "top" => VPlace::Top,
                    "bottom" => VPlace::Bottom,
                    _ => VPlace::Middle,
                };
                return Ok((h, v));
            }

            Ok((h, VPlace::Middle))
        }
    }
}

// ─── Animation block parser ─────────────────────────────────────────────

fn parse_anim_block(input: &mut &str) -> ModalResult<AnimKeyframe> {
    let _ = alt(("when", "anim")).parse_next(input)?;
    let _ = space1.parse_next(input)?;
    let _ = ':'.parse_next(input)?;
    let trigger_str = parse_identifier.parse_next(input)?;
    let trigger = match trigger_str {
        "hover" => AnimTrigger::Hover,
        "press" => AnimTrigger::Press,
        "enter" => AnimTrigger::Enter,
        other => AnimTrigger::Custom(other.to_string()),
    };

    // Trigger-specific default durations
    let default_duration = match &trigger {
        AnimTrigger::Hover => 300u32,
        AnimTrigger::Press => 150u32,
        AnimTrigger::Enter => 500u32,
        AnimTrigger::Custom(_) => 300u32,
    };

    skip_space(input);
    let _ = '{'.parse_next(input)?;

    let mut props = AnimProperties::default();
    let mut duration_ms = default_duration;
    let mut easing = Easing::EaseInOut;
    let mut delay_ms: Option<u32> = None;

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
            "delay" => {
                let n = parse_number.parse_next(input)?;
                delay_ms = Some(n as u32);
                if input.starts_with("ms") {
                    *input = &input[2..];
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
        delay_ms,
    })
}

// ─── Edge anchor parser ─────────────────────────────────────────────────

/// Parse an edge endpoint: `@node_id` or `x y` coordinates.
fn parse_edge_anchor(input: &mut &str) -> ModalResult<EdgeAnchor> {
    skip_space(input);
    if input.starts_with('@') {
        Ok(EdgeAnchor::Node(parse_node_id.parse_next(input)?))
    } else {
        let x = parse_number.parse_next(input)?;
        skip_space(input);
        let y = parse_number.parse_next(input)?;
        Ok(EdgeAnchor::Point(x, y))
    }
}

// ─── Edge defaults parser ──────────────────────────────────────────────

fn parse_edge_defaults_block(input: &mut &str) -> ModalResult<EdgeDefaults> {
    let _ = "edge_defaults".parse_next(input)?;
    skip_space(input);
    let _ = '{'.parse_next(input)?;

    let mut defaults = EdgeDefaults::default();
    skip_ws_and_comments(input);

    while !input.starts_with('}') {
        let prop = parse_identifier.parse_next(input)?;
        skip_space(input);
        let _ = ':'.parse_next(input)?;
        skip_space(input);

        match prop {
            "stroke" => {
                let color = parse_hex_color.parse_next(input)?;
                skip_space(input);
                let w = parse_number.parse_next(input).unwrap_or(1.0);
                defaults.props.stroke = Some(Stroke {
                    paint: Paint::Solid(color),
                    width: w,
                    ..Stroke::default()
                });
            }
            "arrow" => {
                let kind = parse_identifier.parse_next(input)?;
                defaults.arrow = Some(match kind {
                    "none" => ArrowKind::None,
                    "start" => ArrowKind::Start,
                    "end" => ArrowKind::End,
                    "both" => ArrowKind::Both,
                    _ => ArrowKind::None,
                });
            }
            "curve" => {
                let kind = parse_identifier.parse_next(input)?;
                defaults.curve = Some(match kind {
                    "straight" => CurveKind::Straight,
                    "smooth" => CurveKind::Smooth,
                    "step" => CurveKind::Step,
                    _ => CurveKind::Straight,
                });
            }
            "opacity" => {
                defaults.props.opacity = Some(parse_number.parse_next(input)?);
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
    Ok(defaults)
}

// ─── Edge block parser ─────────────────────────────────────────────────

fn parse_edge_block(input: &mut &str) -> ModalResult<(Edge, Option<(NodeId, String)>)> {
    let _ = "edge".parse_next(input)?;
    let _ = space1.parse_next(input)?;

    let id = if input.starts_with('@') {
        parse_node_id.parse_next(input)?
    } else {
        NodeId::anonymous("edge")
    };

    skip_space(input);
    let _ = '{'.parse_next(input)?;

    let mut from = None;
    let mut to = None;
    let mut text_child = None;
    let mut text_child_content = None; // (NodeId, content_string)
    let mut style = Properties::default();
    let mut use_styles = Vec::new();
    let mut arrow = ArrowKind::None;
    let mut curve = CurveKind::Straight;
    let mut note: Option<String> = None;
    let mut animations = Vec::new();
    let mut flow = None;
    let mut label_offset = None;

    skip_ws_and_comments(input);

    while !input.starts_with('}') {
        if input.starts_with("spec ")
            || input.starts_with("spec{")
            || input.starts_with("note ")
            || input.starts_with("note{")
        {
            let content = parse_note_block.parse_next(input)?;
            note = Some(match note {
                Some(existing) => format!("{existing}\n\n{content}"),
                None => content,
            });
        } else if input.starts_with("when") || input.starts_with("anim") {
            animations.push(parse_anim_block.parse_next(input)?);
        } else if input.starts_with("text ") || input.starts_with("text@") {
            // Nested text child: text @id "content" { ... }
            let node = parse_node.parse_next(input)?;
            if let NodeKind::Text { ref content, .. } = node.kind {
                text_child = Some(node.id);
                text_child_content = Some((node.id, content.clone()));
            }
        } else {
            let prop = parse_identifier.parse_next(input)?;
            skip_space(input);
            let _ = ':'.parse_next(input)?;
            skip_space(input);

            match prop {
                "from" => {
                    from = Some(parse_edge_anchor(input)?);
                }
                "to" => {
                    to = Some(parse_edge_anchor(input)?);
                }
                "label" => {
                    // Backward compat: label: "string" → auto-create text child
                    let s = parse_quoted_string
                        .map(|s| s.to_string())
                        .parse_next(input)?;
                    let label_id = NodeId::intern(&format!("_{}_label", id.as_str()));
                    text_child = Some(label_id);
                    text_child_content = Some((label_id, s));
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
                "label_offset" => {
                    let ox = parse_number.parse_next(input)?;
                    skip_space(input);
                    let oy = parse_number.parse_next(input)?;
                    label_offset = Some((ox, oy));
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

    Ok((
        Edge {
            id,
            from: from.unwrap_or(EdgeAnchor::Point(0.0, 0.0)),
            to: to.unwrap_or(EdgeAnchor::Point(0.0, 0.0)),
            text_child,
            props: style,
            use_styles: use_styles.into(),
            arrow,
            curve,
            note,
            animations: animations.into(),
            flow,
            label_offset,
        },
        text_child_content,
    ))
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
        "absolute" | "position" => {
            let x = parse_number.parse_next(input)?;
            skip_space(input);
            let _ = ','.parse_next(input)?;
            skip_space(input);
            let y = parse_number.parse_next(input)?;
            Constraint::Position { x, y }
        }
        _ => {
            let _ = take_till::<_, _, ContextError>(0.., '\n').parse_next(input);
            Constraint::Position { x: 0.0, y: 0.0 }
        }
    };

    if input.starts_with('\n') {
        *input = &input[1..];
    }
    Ok((node_id, constraint))
}

#[cfg(test)]
#[path = "parser_tests.rs"]
mod tests;
