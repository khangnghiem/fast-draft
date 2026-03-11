import { describe, it, expect } from "vitest";
import { buildSpecMarkdown } from "./exportSpec";

describe("exportSpec", () => {
  it("builds spec markdown correctly", () => {
    // In `buildSpecMarkdown`, `processSpecBlock` only checks if a line starts with "spec".
    // It doesn't pick up `accept`, `status`, `priority`, etc. unless they are INSIDE a `spec { ... }` block!
    // The previous test assumed `accept:` on its own line in a node block would be picked up, but looking at the code:
    // `processNodeDecl` matches the node declaration.
    // Inside the loop, it checks `processSpecBlock`. `processSpecBlock` checks if line starts with `spec ` or `spec{`.
    // It does NOT process `accept:` on its own unless it's inside `spec { accept: ... }`!
    // Let's write FD that matches what the parser actually expects: `spec { ... }`

    const fdSource = `
spec "Top level spec"

rect @my_rect {
  spec {
    "Description of my_rect"
    accept: "Acceptance criteria 1"
    status: in_progress
    priority: high
    tag: UI, frontend
  }
}

@generic_node {
  spec {
    "Generic description"
  }
}

edge @e1 {
  from: @my_rect
  to: @generic_node
  label: "Click"
  spec {
    "Triggers transition"
    accept: "Must be smooth"
  }
}
`;
    const md = buildSpecMarkdown(fdSource, "my_file.fd");
    expect(md).toContain("# Spec: my_file.fd");

    expect(md).toContain("## @my_rect `rect`");
    expect(md).toContain("> Description of my_rect");
    expect(md).toContain("- [ ] Acceptance criteria 1");
    expect(md).toContain("- **Status:** in_progress");
    expect(md).toContain("- **Priority:** high");
    expect(md).toContain("- **Tags:** UI, frontend");
    expect(md).toContain("## @generic_node `spec`");
    expect(md).toContain("> Generic description");
    expect(md).toContain("## Flows");
    expect(md).toContain("- **@my_rect** → **@generic_node** — Click");
    expect(md).toContain("> Triggers transition");
    expect(md).toContain("- [ ] Must be smooth");
  });
});
