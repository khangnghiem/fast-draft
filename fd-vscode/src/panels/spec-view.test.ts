import { describe, it, expect } from "vitest";
import { FdSpecViewPanel } from "./spec-view";

describe("FdSpecViewPanel parsing", () => {
  it("parses single-line spec blocks properly", () => {
    const panel = Object.create(FdSpecViewPanel.prototype);
    panel.parseAnnotation = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "}") return null;
      const acceptMatch = trimmed.match(/^accept:\s*"([^"]*)"/);
      if (acceptMatch) return { type: "accept", value: acceptMatch[1] };
      const descMatch = trimmed.match(/^"([^"]*)"/);
      if (descMatch) return { type: "description", value: descMatch[1] };
      return null;
    };
    panel.renderSpecNode = (id: string, kind: string, anns: any[]) => {
      return `<node id="${id}">${anns.map(a => a.value).join(",")}</node>`;
    };

    const source = `
rect @myNode {
  spec { "single line description" }
}
`;
    // @ts-ignore
    const result = panel.parseSpec(source);
    expect(result).toContain("single line description");
  });

  it("handles multi-line spec blocks", () => {
    const panel = Object.create(FdSpecViewPanel.prototype);
    panel.parseAnnotation = (line: string) => {
      const descMatch = line.trim().match(/^"([^"]*)"/);
      if (descMatch) return { type: "description", value: descMatch[1] };
      return null;
    };
    panel.renderSpecNode = (id: string, kind: string, anns: any[]) => {
      return `<node id="${id}">${anns.map(a => a.value).join(",")}</node>`;
    };

    const source = `
rect @myNode {
  spec {
    "multi line description 1"
    "multi line description 2"
  }
}
`;
    // @ts-ignore
    const result = panel.parseSpec(source);
    expect(result).toContain("multi line description 1");
    expect(result).toContain("multi line description 2");
  });

  it("parses nodes inside edges correctly", () => {
    const panel = Object.create(FdSpecViewPanel.prototype);
    panel.parseAnnotation = (line: string) => {
      const descMatch = line.trim().match(/^"([^"]*)"/);
      if (descMatch) return { type: "description", value: descMatch[1] };
      return null;
    };
    panel.renderSpecNode = (id: string, kind: string, anns: any[]) => {
      return `<node id="${id}">${anns.map(a => a.value).join(",")}</node>`;
    };

    const source = `
edge @flow1 {
  from: @a
  to: @b
  spec {
    "edge desc"
  }
}
`;
    // @ts-ignore
    const result = panel.parseSpec(source);
    expect(result).toContain("edge desc");
  });
});
