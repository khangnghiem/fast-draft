import os

with open("docs/CHANGELOG.md", "r") as f:
    content = f.read()

new_entry = """### R3.56 (done) — Export to HTML+CSS+JS
- Implemented `emit_html` in `fd-core` which converts a `SceneGraph` into a standalone HTML string.
- Frame, Group, Rect, Image, and Text nodes are absolutely positioned as `<div>` or `<p>` elements matching layout bounds.
- Ellipse, Path, and Edge nodes are mapped into a full-screen `<svg>` overlay.
- Added support for filling, strokes, fonts, corners, opacity, and text alignment through inline CSS.

"""

content = content.replace("## Completed Requirements\n", "## Completed Requirements\n\n" + new_entry)

with open("docs/CHANGELOG.md", "w") as f:
    f.write(content)
