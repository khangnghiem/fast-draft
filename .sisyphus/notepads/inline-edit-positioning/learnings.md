2026-04-18
- Shared E2E harness lives in tests/check-inline-edit-harness.mjs and should wrap server start/stop, page open, CodeMirror loading, dblclick, textarea position, screenshot, and WASM-ready waits.
- CodeMirror editor is hidden until the Code tab is opened; loadFdContent should switch to .lp-tab[data-tab="code"] before touching .cm-content.
- The inline editor is a real textarea overlay under #canvas-content; position can be read with getBoundingClientRect().
- Avoid any fdCanvas/WASM calls inside page.evaluate(); DOM-only checks are safe, but WASM API access crashes.
- fd-format grammar supports nested text nodes inside rect/ellipse blocks, multiline text via literal newlines in the quoted string, and textVAlign on text nodes for top/middle/bottom alignment.
- Text-in-shape E2E should double-click the shape center, not the border, then verify textarea geometry and padding with DOM-only assertions.
- Narrow in-shape fixtures can be simulated by shrinking the rect width in the fixture text; min-width centering should still keep the overlay centered over the shape bounds.
