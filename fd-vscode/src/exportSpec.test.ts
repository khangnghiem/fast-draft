import { describe, it, expect } from "vitest";
import { buildSpecMarkdown } from "./exportSpec";

describe("exportSpec", () => {
  it("should format nodes correctly", () => {
    const source = `
rect @btn1 "this is a button" {
  spec {
    status: active
  }
}`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## @btn1 `rect`");
    expect(md).toContain("> this is a button");
    expect(md).toContain("- **Status:** active");
  });

  it("should handle inline spec", () => {
    const source = `
ellipse @avatar {
  spec "user avatar image"
}`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## @avatar `ellipse`");
    expect(md).toContain("> user avatar image");
  });

  it("should handle frame nodes", () => {
    const source = `
frame @dashboard "main dashboard" {
  spec {
    priority: high
  }
}`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## @dashboard `frame`");
    expect(md).toContain("> main dashboard");
    expect(md).toContain("- **Priority:** high");
  });

  it("should handle unicode IDs", () => {
    const source = `
rect @ボタン "a button" {
  spec {
    tag: ui
  }
}`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## @ボタン `rect`");
    expect(md).toContain("> a button");
    expect(md).toContain("- **Tags:** ui");
  });

  it("should parse multiple annotations", () => {
    const source = `
rect @btn {
  spec {
    "desc line 1"
    accept: "criterion 1"
    status: wip
    priority: low
    tag: experimental
  }
}`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("> desc line 1");
    expect(md).toContain("- [ ] criterion 1");
    expect(md).toContain("- **Status:** wip");
    expect(md).toContain("- **Priority:** low");
    expect(md).toContain("- **Tags:** experimental");
  });

  it("should ignore empty documents", () => {
    const md = buildSpecMarkdown("   \n\n  ", "empty.fd");
    expect(md).toBe("# Spec: empty.fd\n\n");
  });

  it("should format nested structures correctly", () => {
    const source = `
group @parent "the parent" {
  rect @child "the child" {
    spec "child note"
  }
}`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## @parent `group`");
    expect(md).toContain("> the parent");
    expect(md).toContain("### @child `rect`");
    expect(md).toContain("> the child");
    expect(md).toContain("> child note");
  });

  it("should handle edges", () => {
    const source = `
edge @flow1 {
  from: @a
  to: @b
  label: "clicks"
  spec {
    "edge description"
  }
}`;
    const md = buildSpecMarkdown(source, "test.fd");
    expect(md).toContain("## Flows");
    expect(md).toContain("- **@a** → **@b** — clicks");
    expect(md).toContain("> edge description");
  });
});
