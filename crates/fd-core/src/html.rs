use crate::layout::Viewport;
use crate::layout::resolve_layout;
use crate::model::{NodeKind, SceneGraph};
use std::collections::HashMap;
use std::fmt::Write;

pub fn emit_html(graph: &SceneGraph) -> String {
    let mut out = String::new();
    emit_head(&mut out);

    let layouts = resolve_layout(
        graph,
        Viewport {
            width: 1920.0,
            height: 1080.0,
        },
    );

    emit_svg_layer(&mut out, graph, &layouts);
    emit_dom_layer(&mut out, graph, &layouts);

    writeln!(&mut out, "</body>\n</html>").unwrap();
    out
}

fn emit_head(out: &mut String) {
    writeln!(out, "<!DOCTYPE html>\n<html>\n<head>").unwrap();
    writeln!(out, "<meta charset=\"utf-8\">").unwrap();
    writeln!(out, "<style>").unwrap();
    writeln!(out, "  body {{ margin: 0; padding: 0; overflow: hidden; }}").unwrap();
    writeln!(
        out,
        "  .fd-node {{ position: absolute; box-sizing: border-box; }}"
    )
    .unwrap();
    writeln!(out, "</style>\n</head>\n<body>").unwrap();
}

fn emit_svg_layer(
    out: &mut String,
    graph: &SceneGraph,
    layouts: &HashMap<crate::NodeIndex, crate::model::ResolvedBounds>,
) {
    writeln!(out, "  <svg style=\"position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;\">").unwrap();
    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        match &node.kind {
            NodeKind::Ellipse { rx, ry } => {
                if let Some(rect) = layouts.get(&idx) {
                    let cx = rect.x + rx;
                    let cy = rect.y + ry;
                    writeln!(
                        out,
                        "    <ellipse cx=\"{}\" cy=\"{}\" rx=\"{}\" ry=\"{}\" fill=\"none\" stroke=\"black\" />",
                        cx, cy, rx, ry
                    )
                    .unwrap();
                }
            }
            NodeKind::Path { .. } => {
                writeln!(out, "    <!-- path omitted -->").unwrap();
            }
            _ => {}
        }
    }
    writeln!(out, "  </svg>").unwrap();
}

fn emit_dom_layer(
    out: &mut String,
    graph: &SceneGraph,
    layouts: &HashMap<crate::NodeIndex, crate::model::ResolvedBounds>,
) {
    for idx in graph.graph.node_indices() {
        let node = &graph.graph[idx];
        if let Some(rect) = layouts.get(&idx) {
            match &node.kind {
                NodeKind::Rect { width, height } | NodeKind::Frame { width, height, .. } => {
                    writeln!(out, "  <div class=\"fd-node\" style=\"left: {}px; top: {}px; width: {}px; height: {}px; border: 1px solid black;\"></div>", rect.x, rect.y, width, height).unwrap();
                }
                NodeKind::Text { content, .. } => {
                    writeln!(
                        out,
                        "  <p class=\"fd-node\" style=\"left: {}px; top: {}px; margin: 0;\">{}</p>",
                        rect.x, rect.y, content
                    )
                    .unwrap();
                }
                _ => {}
            }
        }
    }
}
