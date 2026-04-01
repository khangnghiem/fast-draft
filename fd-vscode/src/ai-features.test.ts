import { describe, it, expect } from "vitest";
import { buildSpecMarkdown } from "./exportSpec";
import { FdSpecViewPanel } from "./panels/spec-view";

describe("R4.7: Spec-view export (exportSpec.ts)", () => {
  it("builds markdown report from inline spec annotations", () => {
    const fd = `
rect @btn1 spec "Primary login button" {
  w: 100
}
    `;
    const md = buildSpecMarkdown(fd, "test.fd");
    expect(md).toContain("# Spec: test.fd");
    expect(md).toContain("## @btn1 `rect`");
    expect(md).toContain("> Primary login button");
  });

  it("builds markdown from spec block annotations", () => {
    const fd = `
@dashboard {
  spec {
    "Main view"
    status: in_progress
    priority: high
    accept: "Must load under 1s"
  }
}
    `;
    const md = buildSpecMarkdown(fd, "test.fd");
    expect(md).toContain("## @dashboard `spec`");
    expect(md).toContain("> Main view");
    expect(md).toContain("- **Status:** in_progress");
    expect(md).toContain("- **Priority:** high");
    expect(md).toContain("- [ ] Must load under 1s");
  });

  it("includes flow edges in exported markdown", () => {
    const fd = `
edge @flow1 {
  from: @login
  to: @dash
  label: "Success"
  spec "Transitions to dashboard"
  spec {
    accept: "Shows loading spinner"
  }
}
    `;
    const md = buildSpecMarkdown(fd, "test.fd");
    expect(md).toContain("## Flows");
    expect(md).toContain("- **@login** → **@dash** — Success");
    expect(md).toContain("> Transitions to dashboard");
    expect(md).toContain("- [ ] Shows loading spinner");
  });

  it("handles nested structures correctly", () => {
    const fd = `
group @form {
  spec "Login form"

  rect @submit {
    spec "Submit btn"
  }
}
    `;
    const md = buildSpecMarkdown(fd, "test.fd");
    expect(md).toContain("## @form `group`");
    expect(md).toContain("> Login form");
    expect(md).toContain("### @submit `rect`");
    expect(md).toContain("> Submit btn");
  });

  it("handles missing or empty specs", () => {
    const fd = `
rect @anon { w: 10 }
    `;
    const md = buildSpecMarkdown(fd, "test.fd");
    expect(md).not.toContain("@anon");
  });
});

describe("R4.11: Inline Spec View (panels/spec-view.ts)", () => {
  it("parses inline spec annotations to HTML", () => {
    // We can't easily test FdSpecViewPanel.show() directly as it requires VSCode API
    // but we can test the parseSpec method by exposing it or making it public for tests
    // Using a simple bypass since it's private in TypeScript
    const panelAny = FdSpecViewPanel.prototype as any;

    const fd = `
rect @btn1 spec "Primary login button" {
  w: 100
}
    `;
    const html = panelAny.parseSpec(fd);

    expect(html).toContain('<div class="spec-node">');
    expect(html).toContain('@btn1');
    expect(html).toContain('rect');
    expect(html).toContain('<div class="description">Primary login button</div>');
  });

  it("parses block spec annotations to HTML with badges", () => {
    const panelAny = FdSpecViewPanel.prototype as any;

    const fd = `
@dashboard {
  spec {
    "Main view"
    status: in_progress
    priority: high
    tag: ui, core
    accept: "Must load under 1s"
  }
}
    `;
    const html = panelAny.parseSpec(fd);

    expect(html).toContain('@dashboard');
    expect(html).toContain('<div class="description">Main view</div>');
    expect(html).toContain('<div class="accept-item">Must load under 1s</div>');
    expect(html).toContain('<span class="status-badge status-in_progress">in_progress</span>');
    expect(html).toContain('<span class="priority-badge priority-high">high</span>');
    expect(html).toContain('<span class="tag-badge">ui</span>');
    expect(html).toContain('<span class="tag-badge">core</span>');
  });

  it("renders flow edges with annotations in HTML", () => {
    const panelAny = FdSpecViewPanel.prototype as any;

    const fd = `
edge @flow1 {
  from: @login
  to: @dash
  label: "Success"
  spec "Transitions to dashboard"
}
    `;
    const html = panelAny.parseSpec(fd);

    expect(html).toContain('<div class="section-header">Flows</div>');
    expect(html).toContain('<strong>@login</strong> → <strong>@dash</strong>');
    expect(html).toContain('<span class="edge-label">— Success</span>');
    expect(html).toContain('<span class="description">Transitions to dashboard</span>');
  });
});
