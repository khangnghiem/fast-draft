//! Property-based roundtrip tests using proptest.
//!
//! These tests generate random FD document strings and verify that
//! parse → emit → reparse preserves the document invariants.
//! Gated behind `#[ignore]` — run with `cargo test -- --include-ignored`
//! or via `just extended`.

use fd_core::emitter::emit_document;
use fd_core::parser::parse_document;
use proptest::prelude::*;

/// Strategy: generate a random FD document with 1–5 nodes.
fn arb_fd_document() -> impl Strategy<Value = String> {
    let node_kind = prop_oneof![Just("rect"), Just("ellipse"), Just("text"), Just("path"),];

    let arb_id = "[a-z][a-z0-9_]{1,12}";

    let arb_dimension = (10u32..1000).prop_map(|d| d.to_string());

    let arb_hex = prop::array::uniform6(prop::num::u8::ANY)
        .prop_map(|bytes| format!("#{:02X}{:02X}{:02X}", bytes[0], bytes[1], bytes[2]));

    let arb_node = (
        node_kind,
        arb_id,
        arb_dimension.clone(),
        arb_dimension,
        arb_hex,
    )
        .prop_map(|(kind, id, w, h, color)| {
            if kind == "text" {
                format!("text @{id} \"hello\" {{\n  w: {w} h: {h}\n  fill: {color}\n}}\n")
            } else if kind == "ellipse" {
                format!("{kind} @{id} {{\n  w: {w} h: {h}\n  fill: {color}\n}}\n")
            } else {
                format!("{kind} @{id} {{\n  w: {w} h: {h}\n  fill: {color}\n}}\n")
            }
        });

    prop::collection::vec(arb_node, 1..=5).prop_map(|nodes| nodes.join("\n"))
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// Round-trip invariant: parse → emit → reparse preserves node count and IDs.
    #[test]
    #[ignore] // extended tier — run with --include-ignored
    fn roundtrip_any_document(input in arb_fd_document()) {
        // Skip inputs that fail to parse (malformed RNG combos)
        if let Ok(graph1) = parse_document(&input) {
            let emitted = emit_document(&graph1);
            let graph2 = parse_document(&emitted)
                .expect(&format!("Reparse failed.\nInput:\n{input}\nEmitted:\n{emitted}"));

            // Invariant: node count preserved
            prop_assert_eq!(
                graph1.graph.node_count(),
                graph2.graph.node_count(),
                "Node count mismatch.\nInput:\n{}\nEmitted:\n{}",
                input,
                emitted
            );

            // Invariant: all node IDs preserved
            for id in graph1.id_index.keys() {
                prop_assert!(
                    graph2.id_index.contains_key(id),
                    "Lost node ID {:?} in roundtrip",
                    id
                );
            }

            // Invariant: style count preserved
            prop_assert_eq!(
                graph1.styles.len(),
                graph2.styles.len(),
                "Style count mismatch"
            );
        }
    }
}
