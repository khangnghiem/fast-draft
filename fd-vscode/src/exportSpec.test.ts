import { describe, it, expect } from "vitest";
import { buildSpecMarkdown } from "./exportSpec";

describe("buildSpecMarkdown", () => {
    it("handles spec blocks correctly", () => {
        const source = `
rect @button {
  spec "This is a button"
}
`;
        const result = buildSpecMarkdown(source, "test.fd");
        expect(result).toContain("## @button \`rect\`");
        expect(result).toContain("> This is a button");
    });

    it("handles nested spec blocks", () => {
        const source = `
group @nav {
  spec {
    "Navigation bar"
    status: active
  }
}
`;
        const result = buildSpecMarkdown(source, "test.fd");
        expect(result).toContain("## @nav \`group\`");
        expect(result).toContain("> Navigation bar");
        expect(result).toContain("- **Status:** active");
    });
});

describe("buildSpecMarkdown specific cases", () => {
    it("handles edge body and description correctly", () => {
        const source = `
edge @e1 {
  from: @btn
  to: @page
  label: "Click"
  spec "Navigation edge"
}
`;
        const result = buildSpecMarkdown(source, "test.fd");
        expect(result).toContain("## Flows");
        expect(result).toContain("- **@btn** → **@page** — Click");
        expect(result).toContain("> Navigation edge");
    });
});
    it("handles multiple annotations and attributes", () => {
        const source = `
rect @card {
  spec {
    "A card component"
    status: in-progress
    priority: high
    tag: ui-component
    accept: "Must be responsive"
  }
}
`;
        const result = buildSpecMarkdown(source, "test.fd");
        expect(result).toContain("> A card component");
        expect(result).toContain("- **Status:** in-progress");
        expect(result).toContain("- **Priority:** high");
        expect(result).toContain("- **Tags:** ui-component");
        expect(result).toContain("- [ ] Must be responsive");
    });

    it("handles empty files gracefully", () => {
        const source = ``;
        const result = buildSpecMarkdown(source, "test.fd");
        expect(result).toContain("# Spec: test.fd");
    });

    it("handles deeply nested generic blocks", () => {
        const source = `
group @outer {
  spec "outer info"
  group @inner {
    spec "inner info"
  }
}
`;
        const result = buildSpecMarkdown(source, "test.fd");
        expect(result).toContain("## @outer \`group\`");
        expect(result).toContain("> outer info");
        expect(result).toContain("### @inner \`group\`");
        expect(result).toContain("> inner info");
    });

    it("ignores comments and whitespace", () => {
        const source = `
# This is a comment
rect @rect {

  # Another comment
  spec "Actual spec"
}
`;
        const result = buildSpecMarkdown(source, "test.fd");
        expect(result).not.toContain("This is a comment");
        expect(result).toContain("> Actual spec");
    });

    it("handles generic generic nodes", () => {
        const source = `
@custom_node {
  spec "Custom node spec"
}
`;
        const result = buildSpecMarkdown(source, "test.fd");
        expect(result).toContain("## @custom_node \`spec\`");
        expect(result).toContain("> Custom node spec");
    });
