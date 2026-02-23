/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/**
 * Tree-sitter grammar for FD (Fast Draft) format.
 *
 * FD is a token-efficient format for describing 2D scene graphs
 * with shapes, text, styles, animations, and constraints.
 */
module.exports = grammar({
    name: "fd",

    extras: ($) => [/\s/, $.comment],

    rules: {
        // ─── Document ────────────────────────────────────────────
        document: ($) =>
            repeat(
                choice(
                    $.style_block,
                    $.node_declaration,
                    $.constraint_line,
                    $.spec_block,
                ),
            ),

        // ─── Comments ────────────────────────────────────────────
        comment: (_$) => token(prec(-1, seq("#", /[^#\n][^\n]*/))),

        // ─── Spec Block ─────────────────────────────────────────
        spec_block: ($) =>
            seq(
                "spec",
                choice(
                    $.string, // Inline: spec "description"
                    seq("{", repeat($.spec_item), "}"), // Block: spec { ... }
                ),
            ),

        spec_item: ($) =>
            choice(
                $.spec_typed,
                $.string,
            ),

        spec_typed: ($) =>
            seq(
                field("key", $.spec_keyword),
                ":",
                field("value", choice($.string, $.spec_text)),
            ),

        spec_text: (_$) => /[^\n}]+/,

        spec_keyword: (_$) =>
            choice("accept", "status", "priority", "tag"),

        // ─── Style Block ─────────────────────────────────────────
        style_block: ($) =>
            seq(
                "style",
                field("name", $.identifier),
                "{",
                repeat($.property),
                "}",
            ),

        // ─── Node Declaration ────────────────────────────────────
        node_declaration: ($) =>
            seq(
                field("kind", $.node_kind),
                optional(field("id", $.node_id)),
                optional(field("inline_text", $.string)),
                "{",
                repeat($.node_body_item),
                "}",
            ),

        node_kind: (_$) => choice("group", "rect", "ellipse", "path", "text"),

        node_body_item: ($) =>
            choice(
                $.property,
                $.node_declaration,
                $.anim_block,
                $.spec_block,
            ),

        // ─── Properties ──────────────────────────────────────────
        property: ($) =>
            prec.right(seq(
                field("name", $.property_name),
                ":",
                repeat1($._value_item),
            )),

        property_name: (_$) =>
            choice(
                "w", "h", "width", "height",
                "fill", "stroke", "corner", "opacity",
                "font", "bg", "use", "layout",
                "shadow", "scale", "rotate", "translate",
                "center_in", "offset", "ease", "duration",
            ),

        _value_item: ($) =>
            choice(
                $.number,
                $.hex_color,
                $.string,
                $.node_id,
                $.key_value_pair,
                $.identifier,
            ),

        key_value_pair: ($) =>
            prec(1, seq($.identifier, "=", choice($.number, $.hex_color, $.string, $.identifier))),

        // ─── Animation Block ─────────────────────────────────────
        anim_block: ($) =>
            seq(
                "anim",
                field("trigger", $.anim_trigger),
                "{",
                repeat($.property),
                "}",
            ),

        anim_trigger: ($) => seq(":", $.identifier),

        // ─── Constraint Line ─────────────────────────────────────
        constraint_line: ($) =>
            prec.right(seq(
                field("target", $.node_id),
                "->",
                field("constraint_type", $.identifier),
                ":",
                repeat1($._value_item),
            )),

        // ─── Literals ────────────────────────────────────────────
        node_id: ($) => seq("@", $.identifier),

        identifier: (_$) => /[a-zA-Z_][a-zA-Z0-9_]*/,

        number: (_$) => /-?\d+(\.\d+)?(ms)?/,

        hex_color: (_$) => /#[0-9A-Fa-f]{3,8}/,

        string: (_$) => seq('"', /[^"]*/, '"'),
    },
});
