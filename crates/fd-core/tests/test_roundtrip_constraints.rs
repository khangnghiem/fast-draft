use fd_core::emitter::emit_document;
use fd_core::parser::parse_document;

#[test]
fn test_constraints_example_roundtrip() {
    let source = include_str!("../../../examples/constraints.fd");
    let graph1 = parse_document(source).expect("first parse failed");
    let emitted = emit_document(&graph1);
    let _graph2 = parse_document(&emitted).expect("second parse failed");
}
