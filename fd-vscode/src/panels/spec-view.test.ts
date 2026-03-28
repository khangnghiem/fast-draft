import { describe, it, expect } from "vitest";
import { FdSpecViewPanel } from "./spec-view";

describe("FdSpecViewPanel", () => {
  it("renders an empty spec correctly", () => {
    const panel = Object.create(FdSpecViewPanel.prototype);

    // Testing buildSpecHtml (which calls parseSpec and renderSpecNode)
    const html = panel.buildSpecHtml("");
    expect(html).toContain("No annotations found in this document.");
  });

  it("renders a node with annotations", () => {
    const panel = Object.create(FdSpecViewPanel.prototype);
    const fd = `rect @my_rect {
  spec {
    "A cool description"
    accept: "user can see it"
  }
}`;
    const html = panel.buildSpecHtml(fd);
    expect(html).toContain("@my_rect");
    expect(html).toContain("A cool description");
    expect(html).toContain("user can see it");
  });

  it("renders edges", () => {
    const panel = Object.create(FdSpecViewPanel.prototype);
    const fd = `edge @my_edge {
  from: @node_a
  to: @node_b
  label: "connects"
  spec {
    "Edge description"
  }
}`;
    const html = panel.buildSpecHtml(fd);
    expect(html).toContain("Flows");
    expect(html).toContain("@node_a");
    expect(html).toContain("@node_b");
    expect(html).toContain("connects");
    expect(html).toContain("Edge description");
  });

  it("renders status and priority badges", () => {
    const panel = Object.create(FdSpecViewPanel.prototype);
    const fd = `rect @my_rect {
  spec {
    status: in_progress
    priority: high
    tag: frontend, important
  }
}`;
    const html = panel.buildSpecHtml(fd);
    expect(html).toContain("status-in_progress");
    expect(html).toContain("priority-high");
    expect(html).toContain("frontend");
    expect(html).toContain("important");
  });

  it("handles inline spec block", () => {
    const panel = Object.create(FdSpecViewPanel.prototype);
    const fd = `rect @my_rect {
  spec "An inline description"
}`;
    const html = panel.buildSpecHtml(fd);
    expect(html).toContain("@my_rect");
    expect(html).toContain("An inline description");
  });
});
