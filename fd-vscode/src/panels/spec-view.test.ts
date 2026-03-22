import { describe, it, expect, vi } from "vitest";
import { FdSpecViewPanel } from "./spec-view";

vi.mock("vscode", () => ({
  window: {
    activeTextEditor: undefined,
    createWebviewPanel: vi.fn(),
    onDidChangeActiveTextEditor: vi.fn(),
  },
  workspace: {
    onDidChangeTextDocument: vi.fn(),
  },
  ViewColumn: {
    Beside: 2,
  },
}));

vi.mock("../webview-html", () => ({
  getNonce: () => "test-nonce",
}));

describe("FdSpecViewPanel", () => {
  describe("parseSpec", () => {
    // Access private method for testing
    const parseSpec = FdSpecViewPanel.prototype["parseSpec"].bind(
      Object.create(FdSpecViewPanel.prototype, {
        parseAnnotation: {
          value: (line: string) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "}") return null;
            const acceptMatch = trimmed.match(/^accept:\s*"([^"]*)"/);
            if (acceptMatch) return { type: "accept", value: acceptMatch[1] };
            const statusMatch = trimmed.match(/^status:\s*(\S+)/);
            if (statusMatch) return { type: "status", value: statusMatch[1] };
            const priorityMatch = trimmed.match(/^priority:\s*(\S+)/);
            if (priorityMatch) return { type: "priority", value: priorityMatch[1] };
            const tagMatch = trimmed.match(/^tag:\s*(.+)/);
            if (tagMatch) return { type: "tag", value: tagMatch[1].trim() };
            const descMatch = trimmed.match(/^"([^"]*)"/);
            if (descMatch) return { type: "description", value: descMatch[1] };
            return null;
          }
        }
      })
    );

    it("should return empty message when no specs found", () => {
      const source = `rect @box { w: 100 }`;
      const html = parseSpec(source);
      expect(html).toContain("No annotations found");
    });

    it("should parse an inline spec correctly", () => {
      const source = `
rect @my_box {
  spec "A simple box"
}
      `;
      const html = parseSpec(source);
      expect(html).toContain("spec-node");
      expect(html).toContain("@my_box");
      expect(html).toContain("rect");
      expect(html).toContain("A simple box");
    });

    it("should parse a block spec with tags, priority, and status", () => {
      const source = `
ellipse @my_circle {
  spec {
    "This is a circle"
    status: in_progress
    priority: high
    tag: ui, design
    accept: "Must be round"
  }
}
      `;
      const html = parseSpec(source);
      expect(html).toContain("@my_circle");
      expect(html).toContain("This is a circle");
      expect(html).toContain("status-in_progress");
      expect(html).toContain("priority-high");
      expect(html).toContain("ui");
      expect(html).toContain("design");
      expect(html).toContain("Must be round");
    });

    it("should parse generic nodes with spec blocks", () => {
      const source = `
@generic_node {
  spec {
    "Generic node description"
  }
}
      `;
      const html = parseSpec(source);
      expect(html).toContain("generic_node");
      expect(html).toContain("spec-node generic");
      expect(html).toContain("Generic node description");
    });

    it("should parse edges with spec blocks", () => {
      const source = `
edge @flow {
  from: @node1
  to: @node2
  label: "Submit"
  spec {
    "User submits the form"
    accept: "Data is validated"
  }
}
      `;
      const html = parseSpec(source);
      expect(html).toContain("Flows");
      expect(html).toContain("@node1");
      expect(html).toContain("@node2");
      expect(html).toContain("Submit");
      expect(html).toContain("User submits the form");
    });

    it("should parse multiple nodes correctly", () => {
      const source = `
rect @node1 {
  spec "First node"
}
text @node2 {
  spec "Second node"
}
      `;
      const html = parseSpec(source);
      expect(html).toContain("@node1");
      expect(html).toContain("First node");
      expect(html).toContain("@node2");
      expect(html).toContain("Second node");
    });

    it("should ignore nodes without spec blocks", () => {
      const source = `
rect @node1 {
  w: 100 h: 100
}
text @node2 {
  spec "Has a spec"
}
      `;
      const html = parseSpec(source);
      expect(html).not.toContain("@node1");
      expect(html).toContain("@node2");
    });
  });

  describe("buildSpecHtml", () => {
    const buildSpecHtml = FdSpecViewPanel.prototype["buildSpecHtml"].bind(
      Object.create(FdSpecViewPanel.prototype, {
        parseSpec: {
          value: (source: string) => "<div class=\"mocked-spec\">Parsed</div>"
        }
      })
    );

    it("should return a complete HTML document", () => {
      const html = buildSpecHtml("");
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("📋 Spec View");
      expect(html).toContain("<div class=\"mocked-spec\">Parsed</div>");
    });
  });
});
