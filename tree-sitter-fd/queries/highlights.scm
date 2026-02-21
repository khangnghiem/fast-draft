; FD (Fast Draft) — Tree-sitter highlight queries
; For use with Zed, Neovim, Helix, Emacs, etc.

; ─── Comments ──────────────────────────────────────────────
(comment) @comment

; ─── Keywords ──────────────────────────────────────────────
(node_kind) @keyword
"style" @keyword
"anim" @keyword

; ─── Node IDs ──────────────────────────────────────────────
(node_id
  (identifier) @variable)
(node_id) @variable

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
(hex_color) @constant.builtin
(string) @string

; ─── Key-value pairs ───────────────────────────────────────
(key_value_pair
  key: (identifier) @property)

; ─── Identifiers (layout modes, easing, etc.) ─────────────
(property_value
  (identifier) @constant)

; ─── Punctuation ───────────────────────────────────────────
"{" @punctuation.bracket
"}" @punctuation.bracket
":" @punctuation.delimiter
"," @punctuation.delimiter
"=" @operator
