; FD (Fast Draft) — Zed indentation queries

; Indent inside node declarations and style blocks
(node_declaration "{" @indent "}" @outdent)
(style_block "{" @indent "}" @outdent)
(anim_block "{" @indent "}" @outdent)
