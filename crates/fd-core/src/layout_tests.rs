use super::*;
use crate::id::NodeId;
use crate::parser::parse_document;

#[test]
fn layout_column() {
    let input = r#"
frame @form {
  w: 800 h: 600
  layout: column gap=10 pad=20

  rect @a { w: 100 h: 40 }
  rect @b { w: 100 h: 30 }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let a_idx = graph.index_of(NodeId::intern("a")).unwrap();
    let b_idx = graph.index_of(NodeId::intern("b")).unwrap();

    let a = bounds[&a_idx];
    let b = bounds[&b_idx];

    // Both should be at x = pad (20)
    assert!(
        (a.x - 20.0).abs() < 0.01,
        "a.x should be 20 (pad), got {}",
        a.x
    );
    assert!(
        (b.x - 20.0).abs() < 0.01,
        "b.x should be 20 (pad), got {}",
        b.x
    );

    // The two children should be exactly (height_of_first + gap) apart
    let gap_plus_height = (b.y - a.y).abs();
    // Either a is first (gap = 40 + 10 = 50) or b is first (gap = 30 + 10 = 40)
    assert!(
        (gap_plus_height - 50.0).abs() < 0.01 || (gap_plus_height - 40.0).abs() < 0.01,
        "children should be height+gap apart, got diff = {gap_plus_height}"
    );
}

#[test]
fn layout_center_in_canvas() {
    let input = r#"
rect @box {
  w: 200
  h: 100
}

@box -> center_in: canvas
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let idx = graph.index_of(NodeId::intern("box")).unwrap();
    let b = bounds[&idx];

    assert!((b.x - 300.0).abs() < 0.01); // (800 - 200) / 2
    assert!((b.y - 250.0).abs() < 0.01); // (600 - 100) / 2
}

#[test]
fn layout_group_auto_bounds() {
    // Group auto-sizing: group dimensions are computed from children bounding box
    let input = r#"
group @container {
  rect @a { w: 100 h: 40 x: 10 y: 10 }
  rect @b { w: 80 h: 30 x: 10 y: 60 }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let container_idx = graph.index_of(NodeId::intern("container")).unwrap();
    let cb = &bounds[&container_idx];

    // Group should auto-size to cover both children
    assert!(cb.width > 0.0, "group width should be positive");
    assert!(cb.height > 0.0, "group height should be positive");
    // Width should be at least the wider child (100px)
    assert!(
        cb.width >= 100.0,
        "group width ({}) should be >= 100",
        cb.width
    );
}

#[test]
fn layout_frame_declared_size() {
    let input = r#"
frame @card {
  w: 480 h: 320
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let idx = graph.index_of(NodeId::intern("card")).unwrap();
    let b = &bounds[&idx];

    assert_eq!(b.width, 480.0, "frame should use declared width");
    assert_eq!(b.height, 320.0, "frame should use declared height");
}

#[test]
fn layout_nested_group_auto_size() {
    // Nested groups: both outer and inner auto-size to children
    let input = r#"
group @outer {
  group @inner {
rect @a { w: 100 h: 40 x: 0 y: 0 }
rect @b { w: 80 h: 30 x: 0 y: 50 }
  }
  rect @c { w: 120 h: 50 x: 0 y: 100 }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let inner_idx = graph.index_of(NodeId::intern("inner")).unwrap();
    let outer_idx = graph.index_of(NodeId::intern("outer")).unwrap();

    let inner = bounds[&inner_idx];
    let outer = bounds[&outer_idx];

    // Inner group: height should cover both children
    assert!(
        inner.height >= 70.0,
        "inner group height ({}) should be >= 70 (children bbox)",
        inner.height
    );

    // Outer group should contain both @inner and @c
    let outer_bottom = outer.y + outer.height;
    assert!(
        outer_bottom >= 150.0,
        "outer bottom ({outer_bottom}) should contain all children"
    );
}

#[test]
fn layout_group_child_inside_column_parent() {
    // Frame with column layout containing a group child
    let input = r#"
frame @wizard {
  w: 480 h: 800
  layout: column gap=0 pad=0

  rect @card {
w: 480 h: 520
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let wizard_idx = graph.index_of(NodeId::intern("wizard")).unwrap();
    let card_idx = graph.index_of(NodeId::intern("card")).unwrap();

    let wizard = bounds[&wizard_idx];
    let card = bounds[&card_idx];

    // Card should be inside wizard
    assert!(
        card.y >= wizard.y,
        "card.y ({}) must be >= wizard.y ({})",
        card.y,
        wizard.y
    );
}

#[test]
fn layout_column_preserves_document_order() {
    let input = r#"
frame @card {
  w: 800 h: 600
  layout: column gap=12 pad=24

  text @heading "Monthly Revenue" {
font: "Inter" 600 18
  }
  text @amount "$48,250" {
font: "Inter" 700 36
  }
  rect @button { w: 320 h: 44 }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let heading = bounds[&graph.index_of(NodeId::intern("heading")).unwrap()];
    let amount = bounds[&graph.index_of(NodeId::intern("amount")).unwrap()];
    let button = bounds[&graph.index_of(NodeId::intern("button")).unwrap()];

    assert!(
        heading.y < amount.y,
        "heading (y={}) must be above amount (y={})",
        heading.y,
        amount.y
    );
    assert!(
        amount.y < button.y,
        "amount (y={}) must be above button (y={})",
        amount.y,
        button.y
    );
    // Heading height should use font size × 1.4 (line-height)
    let expected_heading_h = 18.0 * 1.4;
    assert!(
        (heading.height - expected_heading_h).abs() < 0.01,
        "heading height should be {} (font size × 1.4), got {}",
        expected_heading_h,
        heading.height
    );
    // Amount height should use font size × 1.4 (line-height)
    let expected_amount_h = 36.0 * 1.4;
    assert!(
        (amount.height - expected_amount_h).abs() < 0.01,
        "amount height should be {} (font size × 1.4), got {}",
        expected_amount_h,
        amount.height
    );
}

#[test]
fn layout_dashboard_card_with_center_in() {
    let input = r#"
frame @card {
  w: 800 h: 600
  layout: column gap=12 pad=24
  text @heading "Monthly Revenue" { font: "Inter" 600 18 }
  text @amount "$48,250" { font: "Inter" 700 36 }
  text @change "+12.5% from last month" { font: "Inter" 400 14 }
  rect @chart { w: 320 h: 160 }
  rect @button { w: 320 h: 44 }
}
@card -> center_in: canvas
"#;
    let graph = parse_document(input).unwrap();
    let card_idx = graph.index_of(NodeId::intern("card")).unwrap();

    // graph.children() must return document order regardless of platform
    let children: Vec<_> = graph
        .children(card_idx)
        .iter()
        .map(|idx| graph.graph[*idx].id.as_str().to_string())
        .collect();
    assert_eq!(children[0], "heading", "First child must be heading");
    assert_eq!(children[4], "button", "Last child must be button");

    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let heading = bounds[&graph.index_of(NodeId::intern("heading")).unwrap()];
    let amount = bounds[&graph.index_of(NodeId::intern("amount")).unwrap()];
    let change = bounds[&graph.index_of(NodeId::intern("change")).unwrap()];
    let chart = bounds[&graph.index_of(NodeId::intern("chart")).unwrap()];
    let button = bounds[&graph.index_of(NodeId::intern("button")).unwrap()];
    let card = bounds[&graph.index_of(NodeId::intern("card")).unwrap()];

    // All children must be INSIDE the card
    assert!(
        heading.y >= card.y,
        "heading.y({}) must be >= card.y({})",
        heading.y,
        card.y
    );
    assert!(
        button.y + button.height <= card.y + card.height + 0.1,
        "button bottom({}) must be <= card bottom({})",
        button.y + button.height,
        card.y + card.height
    );

    // Document order preserved after center_in shift
    assert!(
        heading.y < amount.y,
        "heading.y({}) < amount.y({})",
        heading.y,
        amount.y
    );
    assert!(
        amount.y < change.y,
        "amount.y({}) < change.y({})",
        amount.y,
        change.y
    );
    assert!(
        change.y < chart.y,
        "change.y({}) < chart.y({})",
        change.y,
        chart.y
    );
    assert!(
        chart.y < button.y,
        "chart.y({}) < button.y({})",
        chart.y,
        button.y
    );
}

#[test]
fn layout_column_ignores_position_constraint() {
    // Children with stale Position constraints inside a column layout
    // should be positioned by the column, not by their Position.
    let input = r#"
frame @card {
  w: 800 h: 600
  layout: column gap=10 pad=20

  rect @a { w: 100 h: 40 }
  rect @b {
w: 100 h: 30
x: 500 y: 500
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let a_idx = graph.index_of(NodeId::intern("a")).unwrap();
    let b_idx = graph.index_of(NodeId::intern("b")).unwrap();
    let card_idx = graph.index_of(NodeId::intern("card")).unwrap();

    let a = bounds[&a_idx];
    let b = bounds[&b_idx];
    let card = bounds[&card_idx];

    // Both children should be at column x = pad (20), NOT at x=500
    assert!(
        (a.x - b.x).abs() < 0.01,
        "a.x ({}) and b.x ({}) should be equal (column aligns them)",
        a.x,
        b.x
    );
    // b should be below a by height + gap (40 + 10 = 50)
    assert!(
        (b.y - a.y - 50.0).abs() < 0.01,
        "b.y ({}) should be a.y + 50, got diff = {}",
        b.y,
        b.y - a.y
    );
    // Both children should be inside the card
    assert!(
        b.y + b.height <= card.y + card.height + 0.1,
        "b bottom ({}) must be inside card bottom ({})",
        b.y + b.height,
        card.y + card.height
    );
}

#[test]
fn layout_group_auto_size_contains_all_children() {
    // A free-layout group should auto-size to contain all children,
    // even those with Position constraints that extend beyond others.
    let input = r#"
group @panel {
  rect @a { w: 100 h: 40 }
  rect @b {
w: 80 h: 30
x: 200 y: 150
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let panel_idx = graph.index_of(NodeId::intern("panel")).unwrap();
    let b_idx = graph.index_of(NodeId::intern("b")).unwrap();

    let panel = bounds[&panel_idx];
    let b = bounds[&b_idx];

    // Panel must contain @b entirely
    assert!(
        panel.x + panel.width >= b.x + b.width,
        "panel right ({}) must contain b right ({})",
        panel.x + panel.width,
        b.x + b.width
    );
    assert!(
        panel.y + panel.height >= b.y + b.height,
        "panel bottom ({}) must contain b bottom ({})",
        panel.y + panel.height,
        b.y + b.height
    );
}

#[test]
fn layout_text_centered_in_rect() {
    let input = r#"
rect @btn {
  w: 320 h: 44
  text @label "View Details" {
font: "Inter" 600 14
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let btn = bounds[&graph.index_of(NodeId::intern("btn")).unwrap()];
    let label = bounds[&graph.index_of(NodeId::intern("label")).unwrap()];

    // Text should use intrinsic size (hug contents), not fill parent
    assert!(
        label.width < btn.width,
        "text width ({}) should be < parent ({})",
        label.width,
        btn.width
    );
    assert!(
        label.height < btn.height,
        "text height ({}) should be < parent ({})",
        label.height,
        btn.height
    );

    // Text should be centered within parent
    let expected_cx = btn.x + btn.width / 2.0;
    let actual_cx = label.x + label.width / 2.0;
    assert!(
        (actual_cx - expected_cx).abs() < 0.1,
        "text center x ({}) should match parent center ({})",
        actual_cx,
        expected_cx
    );
    let expected_cy = btn.y + btn.height / 2.0;
    let actual_cy = label.y + label.height / 2.0;
    assert!(
        (actual_cy - expected_cy).abs() < 0.1,
        "text center y ({}) should match parent center ({})",
        actual_cy,
        expected_cy
    );
}

#[test]
fn layout_text_in_ellipse_centered() {
    let input = r#"
ellipse @badge {
  rx: 60 ry: 30
  text @count "42" {
font: "Inter" 700 20
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let badge = bounds[&graph.index_of(NodeId::intern("badge")).unwrap()];
    let count = bounds[&graph.index_of(NodeId::intern("count")).unwrap()];

    // Text should use intrinsic size, not fill the ellipse
    assert!(
        count.width < badge.width,
        "text width ({}) should be < ellipse ({})",
        count.width,
        badge.width
    );

    // Text should be centered within the ellipse bounding box
    let expected_cx = badge.x + badge.width / 2.0;
    let actual_cx = count.x + count.width / 2.0;
    assert!(
        (actual_cx - expected_cx).abs() < 0.1,
        "text center x ({}) should match ellipse center ({})",
        actual_cx,
        expected_cx
    );
    let expected_cy = badge.y + badge.height / 2.0;
    let actual_cy = count.y + count.height / 2.0;
    assert!(
        (actual_cy - expected_cy).abs() < 0.1,
        "text center y ({}) should match ellipse center ({})",
        actual_cy,
        expected_cy
    );
}

#[test]
fn layout_text_explicit_position_not_expanded() {
    let input = r#"
rect @btn {
  w: 320 h: 44
  text @label "OK" {
font: "Inter" 600 14
x: 10 y: 5
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let btn = bounds[&graph.index_of(NodeId::intern("btn")).unwrap()];
    let label = bounds[&graph.index_of(NodeId::intern("label")).unwrap()];

    // Text with explicit position should NOT be expanded to parent
    assert!(
        label.width < btn.width,
        "text width ({}) should be < parent ({}) when explicit position is set",
        label.width,
        btn.width
    );
}

#[test]
fn layout_text_multiple_children_not_expanded() {
    let input = r#"
rect @card {
  w: 200 h: 100
  text @title "Title" {
font: "Inter" 600 16
  }
  text @subtitle "Sub" {
font: "Inter" 400 12
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let card = bounds[&graph.index_of(NodeId::intern("card")).unwrap()];
    let title = bounds[&graph.index_of(NodeId::intern("title")).unwrap()];
    let subtitle = bounds[&graph.index_of(NodeId::intern("subtitle")).unwrap()];

    // Multiple children: text width should remain intrinsic (not expanded)
    assert!(
        title.width < card.width,
        "text width ({}) should be < parent ({}) with multiple children",
        title.width,
        card.width
    );

    // Both text children should be auto-centered (multi-child lift)
    let title_cx = title.x + title.width / 2.0;
    let card_cx = card.x + card.width / 2.0;
    assert!(
        (title_cx - card_cx).abs() < 1.0,
        "title center_x ({title_cx}) should ≈ card center_x ({card_cx})"
    );
    let subtitle_cx = subtitle.x + subtitle.width / 2.0;
    assert!(
        (subtitle_cx - card_cx).abs() < 1.0,
        "subtitle center_x ({subtitle_cx}) should ≈ card center_x ({card_cx})"
    );
}

#[test]
fn layout_place_center() {
    let input = r#"
rect @btn {
  w: 200 h: 60
  text @label "Click" {
    place: center
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let bounds = resolve_layout(
        &graph,
        Viewport {
            width: 800.0,
            height: 600.0,
        },
    );

    let btn = bounds[&graph.index_of(NodeId::intern("btn")).unwrap()];
    let label = bounds[&graph.index_of(NodeId::intern("label")).unwrap()];

    let label_cx = label.x + label.width / 2.0;
    let btn_cx = btn.x + btn.width / 2.0;
    assert!(
        (label_cx - btn_cx).abs() < 1.0,
        "place:center h — label_cx={label_cx}, btn_cx={btn_cx}"
    );
    let label_cy = label.y + label.height / 2.0;
    let btn_cy = btn.y + btn.height / 2.0;
    assert!(
        (label_cy - btn_cy).abs() < 1.0,
        "place:center v — label_cy={label_cy}, btn_cy={btn_cy}"
    );
}

#[test]
fn layout_place_top_left() {
    let input = r#"
rect @box {
  w: 200 h: 100
  text @corner "X" { place: top-left }
}
"#;
    let graph = parse_document(input).unwrap();
    let bounds = resolve_layout(
        &graph,
        Viewport {
            width: 800.0,
            height: 600.0,
        },
    );

    let parent = bounds[&graph.index_of(NodeId::intern("box")).unwrap()];
    let child = bounds[&graph.index_of(NodeId::intern("corner")).unwrap()];

    assert!((child.x - parent.x).abs() < 0.01, "top-left x mismatch");
    assert!((child.y - parent.y).abs() < 0.01, "top-left y mismatch");
}

#[test]
fn layout_place_bottom_right() {
    let input = r#"
rect @box {
  w: 200 h: 100
  text @corner "X" { place: bottom-right }
}
"#;
    let graph = parse_document(input).unwrap();
    let bounds = resolve_layout(
        &graph,
        Viewport {
            width: 800.0,
            height: 600.0,
        },
    );

    let parent = bounds[&graph.index_of(NodeId::intern("box")).unwrap()];
    let child = bounds[&graph.index_of(NodeId::intern("corner")).unwrap()];

    let expected_x = parent.x + parent.width - child.width;
    let expected_y = parent.y + parent.height - child.height;
    assert!(
        (child.x - expected_x).abs() < 0.01,
        "bottom-right x mismatch"
    );
    assert!(
        (child.y - expected_y).abs() < 0.01,
        "bottom-right y mismatch"
    );
}

#[test]
fn layout_auto_center_multiple_text_children() {
    let input = r#"
rect @card {
  w: 300 h: 200
  text @heading "Hello" { font: "Inter" 700 24 }
  text @body "World" { font: "Inter" 400 14 }
}
"#;
    let graph = parse_document(input).unwrap();
    let bounds = resolve_layout(
        &graph,
        Viewport {
            width: 800.0,
            height: 600.0,
        },
    );

    let card = bounds[&graph.index_of(NodeId::intern("card")).unwrap()];
    let heading = bounds[&graph.index_of(NodeId::intern("heading")).unwrap()];
    let body = bounds[&graph.index_of(NodeId::intern("body")).unwrap()];
    let card_cx = card.x + card.width / 2.0;

    let heading_cx = heading.x + heading.width / 2.0;
    assert!(
        (heading_cx - card_cx).abs() < 1.0,
        "heading center ({heading_cx}) ≈ card center ({card_cx})"
    );

    let body_cx = body.x + body.width / 2.0;
    assert!(
        (body_cx - card_cx).abs() < 1.0,
        "body center ({body_cx}) ≈ card center ({card_cx})"
    );
}

#[test]
fn layout_text_centered_in_rect_inside_column() {
    // Reproduces demo.fd: text inside rect inside column group
    let input = r#"
group @form {
  layout: column gap=16 pad=32

  rect @email_field {
w: 280 h: 44
text @email_hint "Email" { }
  }

  rect @login_btn {
w: 280 h: 48
text @btn_label "Sign In" { }
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let bounds = resolve_layout(&graph, viewport);

    let email_field = bounds[&graph.index_of(NodeId::intern("email_field")).unwrap()];
    let email_hint = bounds[&graph.index_of(NodeId::intern("email_hint")).unwrap()];
    let login_btn = bounds[&graph.index_of(NodeId::intern("login_btn")).unwrap()];
    let btn_label = bounds[&graph.index_of(NodeId::intern("btn_label")).unwrap()];

    // Text bounds must match parent rect for centering to work
    eprintln!(
        "email_field: x={:.1} y={:.1} w={:.1} h={:.1}",
        email_field.x, email_field.y, email_field.width, email_field.height
    );
    eprintln!(
        "email_hint:  x={:.1} y={:.1} w={:.1} h={:.1}",
        email_hint.x, email_hint.y, email_hint.width, email_hint.height
    );
    eprintln!(
        "login_btn:   x={:.1} y={:.1} w={:.1} h={:.1}",
        login_btn.x, login_btn.y, login_btn.width, login_btn.height
    );
    eprintln!(
        "btn_label:   x={:.1} y={:.1} w={:.1} h={:.1}",
        btn_label.x, btn_label.y, btn_label.width, btn_label.height
    );

    // Text should be centered within parent (hug-contents mode)
    let email_field_cx = email_field.x + email_field.width / 2.0;
    let email_hint_cx = email_hint.x + email_hint.width / 2.0;
    assert!(
        (email_hint_cx - email_field_cx).abs() < 0.1,
        "email_hint center x ({}) should match email_field center x ({})",
        email_hint_cx,
        email_field_cx
    );
    let email_field_cy = email_field.y + email_field.height / 2.0;
    let email_hint_cy = email_hint.y + email_hint.height / 2.0;
    assert!(
        (email_hint_cy - email_field_cy).abs() < 0.1,
        "email_hint center y ({}) should match email_field center y ({})",
        email_hint_cy,
        email_field_cy
    );
    // Text should NOT fill parent — hug contents instead
    assert!(
        email_hint.width < email_field.width,
        "email_hint width ({}) should be < email_field width ({})",
        email_hint.width,
        email_field.width
    );

    let login_btn_cx = login_btn.x + login_btn.width / 2.0;
    let btn_label_cx = btn_label.x + btn_label.width / 2.0;
    assert!(
        (btn_label_cx - login_btn_cx).abs() < 0.1,
        "btn_label center x ({}) should match login_btn center x ({})",
        btn_label_cx,
        login_btn_cx
    );
    let login_btn_cy = login_btn.y + login_btn.height / 2.0;
    let btn_label_cy = btn_label.y + btn_label.height / 2.0;
    assert!(
        (btn_label_cy - login_btn_cy).abs() < 0.1,
        "btn_label center y ({}) should match login_btn center y ({})",
        btn_label_cy,
        login_btn_cy
    );
    assert!(
        btn_label.width < login_btn.width,
        "btn_label width ({}) should be < login_btn width ({})",
        btn_label.width,
        login_btn.width
    );
}

/// Regression test for Bug #1+#2A: resolve_subtree must preserve existing
/// cached bounds for children in Free layout mode. This simulates the
/// scenario where JS-measured text bounds are already set, and resizing
/// the parent calls resolve_subtree — child bounds must NOT be overwritten
/// by the intrinsic_size heuristic.
#[test]
fn resolve_subtree_preserves_cached_child_bounds() {
    let input = r#"
rect @parent {
  w: 200 h: 100
  text @child "Hello World" {
    font: "Inter" 400 14
  }
}
"#;
    let graph = parse_document(input).unwrap();
    let viewport = Viewport {
        width: 800.0,
        height: 600.0,
    };
    let mut bounds = resolve_layout(&graph, viewport);

    let parent_idx = graph.index_of(NodeId::intern("parent")).unwrap();
    let child_idx = graph.index_of(NodeId::intern("child")).unwrap();

    // Simulate JS-measured text metrics: set child bounds to a specific size
    // that differs from intrinsic_size heuristic
    let js_measured_width = 85.5;
    let js_measured_height = 20.0;
    if let Some(cb) = bounds.get_mut(&child_idx) {
        cb.width = js_measured_width;
        cb.height = js_measured_height;
    }

    // Now simulate parent resize: update parent bounds and call resolve_subtree
    if let Some(pb) = bounds.get_mut(&parent_idx) {
        pb.width = 300.0; // Resize parent from 200→300
    }
    resolve_subtree(&graph, parent_idx, &mut bounds, viewport);

    let child_after = bounds[&child_idx];

    // Child width must remain the JS-measured value, NOT revert to
    // intrinsic_size's char-count heuristic
    assert!(
        (child_after.width - js_measured_width).abs() < 0.01,
        "child width ({}) should be preserved JS-measured value ({js_measured_width}), not intrinsic_size",
        child_after.width
    );
    assert!(
        (child_after.height - js_measured_height).abs() < 0.01,
        "child height ({}) should be preserved JS-measured value ({js_measured_height})",
        child_after.height
    );

    // Child should be re-centered within the new parent bounds (300 wide)
    let parent_after = bounds[&parent_idx];
    let child_cx = child_after.x + child_after.width / 2.0;
    let parent_cx = parent_after.x + parent_after.width / 2.0;
    assert!(
        (child_cx - parent_cx).abs() < 1.0,
        "child center ({child_cx}) should be ≈ new parent center ({parent_cx})"
    );
}
