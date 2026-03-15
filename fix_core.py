content = open("crates/fd-core/src/completion.rs").read()

if "clip:" not in content:
    content = content.replace('"shadow:", "property", "Drop shadow"),', '"shadow:", "property", "Drop shadow"),\n        ("clip:", "property", "Clip children to bounds"),')

if '"purple"' not in content:
    content = content.replace('("#FFFFFF", "value", "White"),', '("#FFFFFF", "value", "White"),\n            ("red", "value", "Named: red"),\n            ("blue", "value", "Named: blue"),\n            ("green", "value", "Named: green"),\n            ("purple", "value", "Named: purple"),\n            ("orange", "value", "Named: orange"),\n            ("pink", "value", "Named: pink"),\n            ("white", "value", "Named: white"),\n            ("black", "value", "Named: black"),')

with open("crates/fd-core/src/completion.rs", "w") as f:
    f.write(content)
