## 2026-03-20 - Optimize mermaid parser nested Vec::contains
**Learning:** Checking for elements in a Vector within a nested loop like O(N^2) in parse_mermaid subgraph parsing or build_scene_graph layout ordering causes O(N^2) complexity, leading to performance bottlenecks when handling large graphs.
**Action:** Replace linear Vec::contains calls inside loops with O(1) HashSet lookups to reduce algorithmic complexity to O(N).
