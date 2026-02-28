
## 2025-05-15 - Fast Color Hex String Generation
**Learning:** Generating hex strings in Rust hot paths using `format!` involves significant overhead (around 135ms per 1M iterations) due to macro machinery and allocations. Bypassing it by directly assembling bytes `let buf = [b'#', HEX_CHARS[r >> 4], ...]` and using `unsafe { String::from_utf8_unchecked(buf.to_vec()) }` yields around ~80x speedup (~1.7ms per 1M iterations).
**Action:** When serializing colors to strings frequently, construct the string by writing into a pre-sized array or pre-allocated string instead of using `format!`.
