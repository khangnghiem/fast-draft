import { describe, it, expect } from "vitest";
import { buildSpecMarkdown } from "./exportSpec";

describe("buildSpecMarkdown", () => {
  it("exports basic nodes", () => {
    const source = `
rect @myNode {
  spec {
    "This is a test node"
  }
}
`;
    const result = buildSpecMarkdown(source, "test.fd");
    expect(result).toContain("This is a test node");
    expect(result).toContain("## @myNode `rect`");
  });

  it("exports generic nodes", () => {
    const source = `
@generic {
  spec {
    "Generic node"
  }
}
`;
    const result = buildSpecMarkdown(source, "test.fd");
    expect(result).toContain("Generic node");
    expect(result).toContain("## @generic `spec`");
  });

  it("handles empty specs", () => {
    const source = `
rect @myNode {
}
`;
    const result = buildSpecMarkdown(source, "test.fd");
    expect(result).toBe("# Spec: test.fd\n\n");
  });

  it("parses different annotations", () => {
    const source = `
rect @annotated {
  spec {
    "Description text"
    accept: "Criteria 1"
    status: doing
    priority: high
    tag: important, ui
  }
}
`;
    const result = buildSpecMarkdown(source, "test.fd");
    expect(result).toContain("> Description text");
    expect(result).toContain("- [ ] Criteria 1");
    expect(result).toContain("- **Status:** doing");
    expect(result).toContain("- **Priority:** high");
    expect(result).toContain("- **Tags:** important, ui");
  });

  it("handles edges and flows", () => {
    const source = `
rect @a {}
rect @b {}

edge @myEdge {
  from: @a
  to: @b
  label: "connects"
  spec {
    "Edge description"
    accept: "Verify edge"
  }
}
`;
    const result = buildSpecMarkdown(source, "test.fd");
    expect(result).toContain("## Flows");
    expect(result).toContain("- **@a** → **@b** — connects");
    expect(result).toContain("> Edge description");
    expect(result).toContain("- [ ] Verify edge");
  });

  it("handles single-line spec block syntax properly", () => {
    const source = `
rect @myNode {
  spec { "single line syntax" }
}
`;
    const result = buildSpecMarkdown(source, "test.fd");
    expect(result).toContain("single line syntax");
  });

  it("handles inline spec strings without block", () => {
    const source = `
rect @myNode {
  spec "inline syntax"
}
`;
    const result = buildSpecMarkdown(source, "test.fd");
    expect(result).toContain("inline syntax");
  });

  it("ignores comments", () => {
    const source = `
# This is a comment
rect @myNode {
  spec "inline syntax"
}
`;
    const result = buildSpecMarkdown(source, "test.fd");
    expect(result).toContain("inline syntax");
    expect(result).not.toContain("This is a comment");
  });

  it("handles nested headings for grouped nodes", () => {
    const source = `
group @myGroup {
  spec "Group desc"
  rect @myChild {
    spec "Child desc"
  }
}
`;
    const result = buildSpecMarkdown(source, "test.fd");
    expect(result).toContain("## @myGroup `group`");
    expect(result).toContain("### @myChild `rect`");
  });
});
