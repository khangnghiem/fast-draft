with open('crates/fd-core/src/excalidraw.rs', 'r') as f:
    content = f.read()

content = content.replace(
    '''        let stroke_color = style
            .stroke
            .and_then''',
    '''        let stroke_color = style
            .stroke
            .as_ref()
            .and_then'''
)

with open('crates/fd-core/src/excalidraw.rs', 'w') as f:
    f.write(content)
