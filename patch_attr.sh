#!/bin/bash
sed -i 's/id=\"{}\"/id=\"{}\"/g' crates/fd-core/src/html.rs
sed -i 's/node.id.as_str()/escape_attr(node.id.as_str())/g' crates/fd-core/src/html.rs
