with open('docs/REQUIREMENTS.md', 'r') as f:
    text = f.read()

text = text.replace('| R3.16       | `hit_test_resize_handle` (WASM), E2E UX cursor tests                                                                                                                                                                                                               | ⚠️ WASM-side only              |', '| R3.16       | `hit_test_resize_handle` (WASM), E2E UX cursor tests                                                                                                                                                                                                               | ✅ 3 tests                     |')

with open('docs/REQUIREMENTS.md', 'w') as f:
    f.write(text)
