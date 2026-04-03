import { describe, it, expect } from "vitest";
import { buildSpecMarkdown } from "./exportSpec";

describe("buildSpecMarkdown", () => {
    it("exports a basic node with a description annotation", () => {
        const source = `
rect @btn1 {
  spec "A primary action button"
}
`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("## @btn1 `rect`");
        expect(md).toContain("> A primary action button");
    });

    it("exports inline spec format", () => {
        const source = `rect @btn2 spec "An inline spec" { }`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("## @btn2 `rect`");
        expect(md).toContain("> An inline spec");
    });

    it("exports multiple annotations inside a spec block", () => {
        const source = `
group @login_form {
  spec {
    "A form for user login"
    status: WIP
    priority: High
    accept: "Must validate email format"
    tag: ui-component
  }
}
`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("## @login_form `group`");
        expect(md).toContain("> A form for user login");
        expect(md).toContain("- **Status:** WIP");
        expect(md).toContain("- **Priority:** High");
        expect(md).toContain("- [ ] Must validate email format");
        expect(md).toContain("- **Tags:** ui-component");
    });

    it("handles deeply nested nodes and adjusts heading levels", () => {
        const source = `
group @container {
  spec "Main wrapper"
  rect @card {
    spec "Inner card"
    text @title {
      spec "Card title"
    }
  }
}
`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("## @container `group`");
        expect(md).toContain("### @card `rect`");
        expect(md).toContain("#### @title `text`");
    });

    it("exports generic nodes with annotations", () => {
        const source = `
@abstract_node {
  spec "A generic placeholder"
}
`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("## @abstract_node `spec`");
        expect(md).toContain("> A generic placeholder");
    });

    it("handles empty nodes without spec block gracefully", () => {
        const source = `
rect @ignored {
  fill: #FFF
}
group @also_ignored { }
`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).not.toContain("@ignored");
        expect(md).not.toContain("@also_ignored");
    });

    it("exports edges with label and annotations", () => {
        const source = `
edge @flow1 {
  from: @start
  to: @end
  label: "User clicks next"
  spec {
    "Transition to the next step"
    accept: "Animation should be smooth"
  }
}
`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("## Flows");
        expect(md).toContain("- **@start** → **@end** — User clicks next");
        expect(md).toContain("> Transition to the next step");
        expect(md).toContain("- [ ] Animation should be smooth");
    });
});
