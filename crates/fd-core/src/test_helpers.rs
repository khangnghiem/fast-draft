//! Shared test utilities for fd-core.
//!
//! Provides macros and helpers to reduce boilerplate in round-trip tests.

/// Parse → emit → re-parse round-trip test.
///
/// Verifies that the input survives a full parse → emit → re-parse cycle
/// with the same node count, style count, and all node IDs preserved.
///
/// # Usage
/// ```ignore
/// roundtrip!(simple_rect, r#"
/// rect @box {
///   w: 100 h: 50
///   fill: #FF0000
/// }
/// "#);
/// ```
#[macro_export]
macro_rules! roundtrip {
    ($name:ident, $input:expr) => {
        #[test]
        fn $name() {
            let input = $input;
            let graph1 = $crate::parser::parse_document(input)
                .expect(concat!("parse failed: ", stringify!($name)));
            let emitted = $crate::emitter::emit_document(&graph1);
            let graph2 = $crate::parser::parse_document(&emitted)
                .expect(concat!("re-parse failed: ", stringify!($name),));

            assert_eq!(
                graph1.graph.node_count(),
                graph2.graph.node_count(),
                "node count mismatch in {}\nInput:\n{}\nEmitted:\n{}",
                stringify!($name),
                input,
                emitted
            );
            assert_eq!(
                graph1.styles.len(),
                graph2.styles.len(),
                "style count mismatch in {}",
                stringify!($name)
            );
            for id in graph1.id_index.keys() {
                assert!(
                    graph2.id_index.contains_key(id),
                    "node ID {id:?} lost in {}",
                    stringify!($name)
                );
            }
        }
    };

    ($name:ident, $input:expr, |$g1:ident, $g2:ident, $emitted:ident| $body:block) => {
        #[test]
        fn $name() {
            let input = $input;
            let $g1 = $crate::parser::parse_document(input)
                .expect(concat!("parse failed: ", stringify!($name)));
            let $emitted = $crate::emitter::emit_document(&$g1);
            let $g2 = $crate::parser::parse_document(&$emitted)
                .expect(concat!("re-parse failed: ", stringify!($name),));
            $body
        }
    };
}
