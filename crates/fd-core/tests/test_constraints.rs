use fd_core::parser::parse_document;
use fd_core::{Viewport, layout::resolve_layout};

#[test]
fn test_missing_brace() {
    let input = "path @path_0 {\n  d: M 438 241\n  rect @rect_0 {\n  x: 300\n  y: 300\n  w: 100\n  h: 100\n  }\n  ect @rect_0 {\n  x: 300\n  y: 300\n  w: 100\n  h: 100\n  }\n}";
    match parse_document(input) {
        Ok(graph) => {
            let viewport = Viewport {
                width: 800.0,
                height: 600.0,
            };
            let bounds = resolve_layout(&graph, viewport);
            for (idx, b) in &bounds {
                let node = &graph.graph[*idx];
                println!("NODE: {} -> BOUNDS: {:?}", node.id.as_str(), b);
            }
        }
        Err(e) => println!("ERROR: {:?}", e),
    }
}
