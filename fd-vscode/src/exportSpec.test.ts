import { describe, expect, it } from "vitest";
import { buildSpecMarkdown } from "./exportSpec";

describe("buildSpecMarkdown", () => {
  it("should parse an inline spec correctly", () => {
    const source = `
rect @my_rect {
  spec "This is a rectangle"
}
`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## @my_rect `rect`");
    expect(md).toContain("> This is a rectangle");
  });

  it("should parse a multiline spec block correctly", () => {
    const source = `
group @my_group {
  spec {
    "This is a group"
    status: active
    priority: high
    tag: ui
    accept: "looks good"
  }
}
`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## @my_group `group`");
    expect(md).toContain("> This is a group");
    expect(md).toContain("- **Status:** active");
    expect(md).toContain("- **Priority:** high");
    expect(md).toContain("- **Tags:** ui");
    expect(md).toContain("- [ ] looks good");
  });

  it("should parse generic nodes", () => {
    const source = `
@generic_node {
  spec "A generic node"
}
`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## @generic_node `spec`");
    expect(md).toContain("> A generic node");
  });

  it("should handle nested structures", () => {
    const source = `
group @parent {
  rect @child {
    spec "Nested child"
  }
}
`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("### @child `rect`");
    expect(md).toContain("> Nested child");
  });

  it("should parse edge definitions with annotations", () => {
    const source = `
edge @flow1 {
  from: @node1
  to: @node2
  label: "connects"
  spec {
    "data flows here"
    accept: "verified"
  }
}
`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## Flows");
    expect(md).toContain("- **@node1** → **@node2** — connects");
    expect(md).toContain("> data flows here");
    expect(md).toContain("- [ ] verified");
  });

  it("should handle empty input safely", () => {
    const md = buildSpecMarkdown("", "test.fd");
    expect(md).toBe("# Spec: test.fd\n\n");
  });

  it("should handle comments gracefully", () => {
    const source = `
# This is a comment
rect @node1 {
  # another comment
  spec "Has a comment"
}
`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## @node1 `rect`");
    expect(md).toContain("> Has a comment");
  });

  it("should handle unicode in @id names", () => {
    const source = `
rect @node_測試 {
  spec "Unicode node"
}
`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## @node_測試 `rect`");
    expect(md).toContain("> Unicode node");
  });

});
