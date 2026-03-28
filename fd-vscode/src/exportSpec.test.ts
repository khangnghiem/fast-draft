import { describe, it, expect } from "vitest";
import { buildSpecMarkdown } from "./exportSpec";

describe("buildSpecMarkdown", () => {
    it("exports a simple node", () => {
        const source = `rect @my_rect {
  spec {
    "A cool description"
    accept: "user can see it"
  }
}`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("## @my_rect `rect`");
        expect(md).toContain("> A cool description");
        expect(md).toContain("- [ ] user can see it");
    });

    it("handles inline spec", () => {
        const source = `rect @my_rect {
  spec "An inline description"
}`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("## @my_rect `rect`");
        expect(md).toContain("> An inline description");
    });

    it("handles edges", () => {
        const source = `edge @my_edge {
  from: @node_a
  to: @node_b
  label: "connects"
  spec {
    "Edge description"
  }
}`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("## Flows");
        expect(md).toContain("- **@node_a** → **@node_b** — connects");
        expect(md).toContain("> Edge description");
    });

    it("handles hierarchy depths correctly", () => {
        const source = `group @my_group {
  spec "Group desc"
  rect @my_rect {
    spec "Rect desc"
  }
}`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("## @my_group `group`");
        expect(md).toContain("> Group desc");
        expect(md).toContain("### @my_rect `rect`");
        expect(md).toContain("> Rect desc");
    });

    it("handles generic nodes", () => {
        const source = `@some_node {
  spec "Generic desc"
}`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("## @some_node `spec`");
        expect(md).toContain("> Generic desc");
    });

    it("handles tags, priority and status", () => {
        const source = `rect @my_rect {
  spec {
    tag: feature
    priority: high
    status: in_progress
  }
}`;
        const md = buildSpecMarkdown(source, "test.fd");
        expect(md).toContain("- **Tags:** feature");
        expect(md).toContain("- **Priority:** high");
        expect(md).toContain("- **Status:** in_progress");
    });
});
