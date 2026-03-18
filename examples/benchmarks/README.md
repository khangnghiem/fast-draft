# FD vs Excalidraw Benchmarks

Side-by-side comparisons showing FD's advantage over Excalidraw's JSON format.

## Metrics

| Example               | Persona           | FD              | Excalidraw      | Byte Ratio | Token Ratio |
| --------------------- | ----------------- | --------------- | --------------- | ---------- | ----------- |
| `dashboard_card`      | Product Designer  | 48 ln / 775 B   | 253 ln / 7.3 KB | **9.4×**   | **4.2×**    |
| `wireframe_ecommerce` | UX Researcher     | 68 ln / 2.3 KB  | 671 ln / 19 KB  | **8.1×**   | **3.7×**    |
| `api_flowchart`       | Software Engineer | 212 ln / 3.3 KB | 1004 ln / 28 KB | **8.5×**   | **3.7×**    |
| `data_dashboard`      | Data Analyst      | 187 ln / 4.6 KB | 1258 ln / 36 KB | **7.8×**   | **3.8×**    |
| `login_form`          | Product Designer  | 128 ln / 2.4 KB | 508 ln / 16 KB  | **6.7×**   | **3.7×**    |
| `network_topology`    | Systems Architect | 282 ln / 4.6 KB | 922 ln / 29 KB  | **6.2×**   | **3.1×**    |
| `pricing_table`       | Marketing         | 209 ln / 4.4 KB | 853 ln / 24 KB  | **5.5×**   | **3.2×**    |
| `mobile_onboarding`   | Mobile Designer   | 184 ln / 3.5 KB | 663 ln / 19 KB  | **5.4×**   | **2.7×**    |
| `kanban_board`        | Project Manager   | 181 ln / 3.7 KB | 661 ln / 19 KB  | **5.1×**   | **2.7×**    |
| `design_system`       | Brand Designer    | 196 ln / 5.7 KB | 938 ln / 28 KB  | **5.0×**   | **2.5×**    |
| `org_chart`           | HR / Manager      | 234 ln / 4.1 KB | 553 ln / 16 KB  | **3.8×**   | **1.7×**    |

> **Average: 6.5× fewer bytes, 3.2× fewer tokens.**

## FD Features Demonstrated

| Feature                                      | Examples                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `style` blocks + `use:`                      | All except wireframe_ecommerce                                                 |
| `layout:` (column/row/grid)                  | dashboard, login, kanban, org, mobile, pricing, wireframe, data, design_system |
| `edge` with labels + curves                  | api_flowchart, org_chart, network_topology                                     |
| `spec` blocks                                | api_flowchart, login_form, wireframe_ecommerce, network_topology               |
| `when` animations                            | dashboard, login, mobile, pricing, design_system                               |
| `frame` + `clip`                             | mobile_onboarding                                                              |
| `ellipse`                                    | org_chart                                                                      |
| Named colors (`fill: purple`)                | kanban, org_chart, design_system, network_topology                             |
| `opacity:`                                   | org_chart, design_system                                                       |
| Legacy property aliases (accepted, not canonical) | design_system                                                              |
| `import`                                     | design_system                                                                  |
| Font weight names                            | All except dashboard_card                                                      |

## What FD Can Express That Excalidraw Cannot

- **`spec` blocks** — structured annotations (todo, done, tag)
- **`when` blocks** — hover/press/enter animations with easing
- **`import`** — cross-file token sharing
- **`style` + `use:`** — DRY style reuse (change once, update everywhere)
- **Named colors** — `fill: purple` instead of `fill: #6C5CE7`
- **Layout constraints** — `layout: column gap=12` instead of manual x/y
- **Edge labels** — `label: "round-robin"` inline with connection

## Running Metrics

```bash
./compare.sh
```
