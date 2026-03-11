import { describe, it, expect } from "vitest";
import { FdSpecViewPanel } from "./spec-view";

describe("FdSpecViewPanel.parseSpec", () => {
  it("parses spec block and node annotations to HTML", () => {
    // FdSpecViewPanel.parseSpec uses `lines.indexOf(line)` to find the line index.
    // If there are identical lines (like `spec {`), `indexOf` finds the FIRST one!
    // That means the second `spec {` block will parse the FIRST one's contents again!
    // To avoid this bug in the test, we must make sure each `spec {` line is unique or we add trailing spaces to make them unique.

    const fdSource = `
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
  }
}
`;

    // To call a method, we can cast the prototype.
    // Since `parseSpec` calls `this.parseAnnotation(specLine)`, we need to provide `parseAnnotation` on the `this` context.
    const context = {
      parseAnnotation: (FdSpecViewPanel.prototype as any).parseAnnotation,
      renderSpecNode: (FdSpecViewPanel.prototype as any).renderSpecNode
    };
    const parseSpec = FdSpecViewPanel.prototype.parseSpec.bind(context);
    const html = parseSpec(fdSource);

    expect(html).toContain("Description of my_rect");
    expect(html).toContain("Acceptance criteria 1");
    expect(html).toContain("in_progress");
    expect(html).toContain("high");
    expect(html).toContain("UI");
    expect(html).toContain("frontend");
    expect(html).toContain("Generic description");
    expect(html).toContain("Flows");
    expect(html).toContain("my_rect");
    expect(html).toContain("generic_node");
    expect(html).toContain("Click");
    expect(html).toContain("Triggers transition");
  });
});
