; FD (Fast Draft) — Zed highlight queries
; These queries map tree-sitter-fd nodes to Zed highlight scopes

; ─── Comments ──────────────────────────────────────────────
(comment) @comment

; ─── Keywords ──────────────────────────────────────────────
(node_kind) @keyword
"style" @keyword
"anim" @keyword

; ─── Node IDs ──────────────────────────────────────────────
(node_id
  (identifier) @variable.special)

; ─── Properties ────────────────────────────────────────────
(property_name) @property

; ─── Annotations ───────────────────────────────────────────
"##" @attribute
(annotation_keyword) @attribute

; ─── Animation trigger ─────────────────────────────────────
(anim_trigger
  (identifier) @label)

; ─── Constraint arrow ──────────────────────────────────────
"->" @operator

; ─── Literals ──────────────────────────────────────────────
(number) @number
(hex_color) @constant
(string) @string

; ─── Key-value pairs ───────────────────────────────────────
(key_value_pair
  (identifier) @property)

; ─── Identifiers in property values ────────────────────────
(property
  (identifier) @constant)

; ─── Punctuation ───────────────────────────────────────────
"{" @punctuation.bracket
"}" @punctuation.bracket
":" @punctuation.delimiter
"=" @operator
