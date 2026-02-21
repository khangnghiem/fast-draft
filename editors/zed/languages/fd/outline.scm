; FD (Fast Draft) — Zed outline queries
; Shows nodes and styles in the breadcrumb / symbol outline

(style_block
  "style"
  name: (identifier) @name) @item

(node_declaration
  kind: (node_kind) @context
  id: (node_id (identifier) @name)) @item
