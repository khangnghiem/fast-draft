import { describe, it, expect } from "vitest";
import {
    parseRenamifyResponse,
    applyGlobalRenames,
    buildRenamifyPrompt,
    heuristicRename,
    RenameProposal,
} from "./ai-renamify";

// ─── parseRenamifyResponse ───────────────────────────────────────────────

describe("parseRenamifyResponse", () => {
    it("parses valid JSON rename map", () => {
        const raw = '{"rect_1": "hero_card", "text_3": "page_title"}';
        const proposals = parseRenamifyResponse(
            raw,
            ["rect_1", "text_3"],
            []
        );
        expect(proposals).toHaveLength(2);
        expect(proposals[0]).toEqual({ oldId: "rect_1", newId: "hero_card" });
        expect(proposals[1]).toEqual({ oldId: "text_3", newId: "page_title" });
    });

    it("returns empty for malformed JSON", () => {
        const raw = "this is not json at all";
        expect(parseRenamifyResponse(raw, ["rect_1"], [])).toEqual([]);
    });

    it("returns empty for empty JSON object", () => {
        const raw = "{}";
        expect(parseRenamifyResponse(raw, ["rect_1"], [])).toEqual([]);
    });

    it("returns empty when JSON is null", () => {
        const raw = "null";
        expect(parseRenamifyResponse(raw, ["rect_1"], [])).toEqual([]);
    });

    it("returns empty when JSON is an array", () => {
        const raw = '["rect_1", "hero"]';
        expect(parseRenamifyResponse(raw, ["rect_1"], [])).toEqual([]);
    });

    it("strips markdown ```json fences", () => {
        const raw = '```json\n{"rect_1": "sidebar_bg"}\n```';
        const proposals = parseRenamifyResponse(raw, ["rect_1"], []);
        // Now works after stripMarkdownFences supports json
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("sidebar_bg");
    });

    it("handles clean JSON without fences", () => {
        const raw = '{"rect_1": "sidebar_bg"}';
        const proposals = parseRenamifyResponse(raw, ["rect_1"], []);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("sidebar_bg");
    });

    it("strips bare ``` fences", () => {
        const raw = '```\n{"text_2": "nav_label"}\n```';
        const proposals = parseRenamifyResponse(raw, ["text_2"], []);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("nav_label");
    });

    it("skips IDs not in the anonymous list", () => {
        const raw = '{"rect_1": "hero", "unknown_99": "mystery"}';
        const proposals = parseRenamifyResponse(raw, ["rect_1"], []);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].oldId).toBe("rect_1");
    });

    it("skips non-string values", () => {
        const raw = '{"rect_1": 42, "text_2": "valid_name"}';
        const proposals = parseRenamifyResponse(
            raw,
            ["rect_1", "text_2"],
            []
        );
        expect(proposals).toHaveLength(1);
        expect(proposals[0].oldId).toBe("text_2");
    });

    it("skips empty string values", () => {
        const raw = '{"rect_1": "", "text_2": "ok_name"}';
        const proposals = parseRenamifyResponse(
            raw,
            ["rect_1", "text_2"],
            []
        );
        expect(proposals).toHaveLength(1);
        expect(proposals[0].oldId).toBe("text_2");
    });

    // ── Conflict Resolution ──

    it("resolves conflict with existing IDs by appending _2", () => {
        const raw = '{"rect_1": "hero"}';
        const proposals = parseRenamifyResponse(
            raw,
            ["rect_1"],
            ["hero"] // hero already exists
        );
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("hero_2");
    });

    it("resolves multiple conflicts by incrementing suffix", () => {
        const raw = '{"rect_1": "card"}';
        const proposals = parseRenamifyResponse(
            raw,
            ["rect_1"],
            ["card", "card_2", "card_3"] // all taken
        );
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("card_4");
    });

    it("resolves conflicts between proposals themselves", () => {
        const raw = '{"rect_1": "button", "rect_2": "button"}';
        const proposals = parseRenamifyResponse(
            raw,
            ["rect_1", "rect_2"],
            []
        );
        expect(proposals).toHaveLength(2);
        expect(proposals[0].newId).toBe("button");
        expect(proposals[1].newId).toBe("button_2");
    });

    // ── Sanitization ──

    it("sanitizes names with spaces and hyphens", () => {
        const raw = '{"rect_1": "Hero Card"}';
        const proposals = parseRenamifyResponse(raw, ["rect_1"], []);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("hero_card");
    });

    it("sanitizes names with special characters", () => {
        const raw = '{"rect_1": "nav@bar!"}';
        const proposals = parseRenamifyResponse(raw, ["rect_1"], []);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("navbar");
    });

    it("skips when sanitized name equals old ID", () => {
        const raw = '{"rect_1": "rect_1"}';
        const proposals = parseRenamifyResponse(raw, ["rect_1"], []);
        expect(proposals).toEqual([]);
    });

    it("truncates names longer than 30 characters", () => {
        const raw =
            '{"rect_1": "this_is_an_extremely_long_name_that_exceeds_limit"}';
        const proposals = parseRenamifyResponse(raw, ["rect_1"], []);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId.length).toBeLessThanOrEqual(30);
    });

    // ── Order Preservation ──

    it("preserves the order of anonymous IDs", () => {
        const raw =
            '{"text_5": "footer_text", "rect_1": "hero_bg", "ellipse_3": "avatar"}';
        const anonIds = ["rect_1", "ellipse_3", "text_5"];
        const proposals = parseRenamifyResponse(raw, anonIds, []);
        expect(proposals[0].oldId).toBe("rect_1");
        expect(proposals[1].oldId).toBe("ellipse_3");
        expect(proposals[2].oldId).toBe("text_5");
    });
});

// ─── applyGlobalRenames ──────────────────────────────────────────────────

describe("applyGlobalRenames", () => {
    it("renames a single node declaration", () => {
        const fd = "rect @rect_1 {\n  fill: #FF0000\n}";
        const result = applyGlobalRenames(fd, [
            { oldId: "rect_1", newId: "hero_bg" },
        ]);
        expect(result).toBe("rect @hero_bg {\n  fill: #FF0000\n}");
    });

    it("renames multiple nodes", () => {
        const fd = "rect @rect_1 {\n}\ntext @text_2 {\n}";
        const result = applyGlobalRenames(fd, [
            { oldId: "rect_1", newId: "card" },
            { oldId: "text_2", newId: "title" },
        ]);
        expect(result).toContain("@card");
        expect(result).toContain("@title");
        expect(result).not.toContain("@rect_1");
        expect(result).not.toContain("@text_2");
    });

    it("renames constraint references", () => {
        const fd =
            "rect @rect_1 {\n  fill: #FFF\n}\n@rect_1 -> center_in: canvas";
        const result = applyGlobalRenames(fd, [
            { oldId: "rect_1", newId: "hero" },
        ]);
        expect(result).toBe(
            "rect @hero {\n  fill: #FFF\n}\n@hero -> center_in: canvas"
        );
    });

    it("renames edge from: and to: references", () => {
        const fd =
            "edge @flow {\n  from: @rect_1\n  to: @text_2\n}";
        const result = applyGlobalRenames(fd, [
            { oldId: "rect_1", newId: "login_btn" },
            { oldId: "text_2", newId: "dashboard" },
        ]);
        expect(result).toContain("from: @login_btn");
        expect(result).toContain("to: @dashboard");
    });

    it("renames center_in: references", () => {
        const fd =
            "rect @rect_1 {\n  center_in: @group_2\n}";
        const result = applyGlobalRenames(fd, [
            { oldId: "group_2", newId: "main_panel" },
        ]);
        expect(result).toContain("center_in: @main_panel");
    });

    it("renames use: references", () => {
        const fd = "rect @rect_1 {\n  use: @rect_2\n}";
        const result = applyGlobalRenames(fd, [
            { oldId: "rect_2", newId: "card_style" },
        ]);
        expect(result).toContain("use: @card_style");
    });

    // ── Word Boundary Safety ──

    it("does not clobber @rect_10 when renaming @rect_1", () => {
        const fd = "rect @rect_1 {\n}\nrect @rect_10 {\n}";
        const result = applyGlobalRenames(fd, [
            { oldId: "rect_1", newId: "hero" },
        ]);
        expect(result).toContain("@hero");
        expect(result).toContain("@rect_10");
        expect(result).not.toContain("@hero0");
    });

    it("does not clobber @rect_1_extra when renaming @rect_1", () => {
        const fd = "rect @rect_1 {\n}\nrect @rect_1_extra {\n}";
        const result = applyGlobalRenames(fd, [
            { oldId: "rect_1", newId: "card" },
        ]);
        expect(result).toContain("@card");
        // @rect_1_extra should NOT become @card_extra — word boundary protects
        // Note: \b in regex treats _ as a non-word boundary, so @rect_1_extra
        // WOULD match @rect_1 followed by _extra. Let's verify actual behavior.
        // The regex uses \b which considers _ as word char, so @rect_1\b won't
        // match @rect_1_ — this is correct behavior.
        expect(result).toContain("@rect_1_extra");
    });

    // ── Edge Cases ──

    it("returns unchanged text for empty renames", () => {
        const fd = "rect @hero {\n  fill: #FFF\n}";
        const result = applyGlobalRenames(fd, []);
        expect(result).toBe(fd);
    });

    it("handles multiple occurrences of the same ID", () => {
        const fd =
            "rect @rect_1 {\n}\n@rect_1 -> center_in: canvas\nedge @e {\n  from: @rect_1\n  to: @other\n}";
        const result = applyGlobalRenames(fd, [
            { oldId: "rect_1", newId: "main_card" },
        ]);
        const occurrences = (result.match(/@main_card/g) || []).length;
        expect(occurrences).toBe(3);
        expect(result).not.toContain("@rect_1");
    });

    it("handles FD document with comments", () => {
        const fd = "# A red rectangle\nrect @rect_1 {\n  fill: #FF0000\n}";
        const result = applyGlobalRenames(fd, [
            { oldId: "rect_1", newId: "red_box" },
        ]);
        expect(result).toContain("# A red rectangle");
        expect(result).toContain("@red_box");
    });
});

// ─── buildRenamifyPrompt ─────────────────────────────────────────────────

describe("buildRenamifyPrompt", () => {
    it("includes all anonymous IDs in the prompt", () => {
        const prompt = buildRenamifyPrompt("rect @rect_1 {}", [
            "rect_1",
            "text_2",
        ]);
        expect(prompt).toContain("@rect_1");
        expect(prompt).toContain("@text_2");
    });

    it("includes the FD document text", () => {
        const fdText = "rect @rect_1 {\n  fill: #FF0000\n  w: 200 h: 50\n}";
        const prompt = buildRenamifyPrompt(fdText, ["rect_1"]);
        expect(prompt).toContain("fill: #FF0000");
        expect(prompt).toContain("w: 200 h: 50");
    });

    it("includes FD format mention", () => {
        const prompt = buildRenamifyPrompt("rect @rect_1 {}", ["rect_1"]);
        expect(prompt).toContain("FD");
        expect(prompt).toContain("Fast Draft");
    });

    it("includes JSON output instruction", () => {
        const prompt = buildRenamifyPrompt("rect @rect_1 {}", ["rect_1"]);
        expect(prompt).toContain("JSON");
    });

    it("includes snake_case rule", () => {
        const prompt = buildRenamifyPrompt("rect @rect_1 {}", ["rect_1"]);
        expect(prompt).toContain("snake_case");
    });

    it("includes max length rule", () => {
        const prompt = buildRenamifyPrompt("rect @rect_1 {}", ["rect_1"]);
        expect(prompt).toContain("20 characters");
    });

    it("includes example output", () => {
        const prompt = buildRenamifyPrompt("rect @rect_1 {}", ["rect_1"]);
        expect(prompt).toContain("sidebar_bg");
        expect(prompt).toContain("page_title");
    });
});

// ─── heuristicRename ─────────────────────────────────────────────────────

describe("heuristicRename", () => {
    // ── Text Content Extraction ──

    it("renames text node using inline text content", () => {
        const fd = 'text @_text_1 "Login" {\n  font: Inter 16\n}';
        const proposals = heuristicRename(fd);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].oldId).toBe("_text_1");
        expect(proposals[0].newId).toBe("login_label");
    });

    it("renames text node using content: property", () => {
        const fd = 'text @_text_2 {\n  content: "Sign Up"\n}';
        const proposals = heuristicRename(fd);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("sign_up_label");
    });

    it("truncates long text content to 3 words", () => {
        const fd = 'text @_text_1 "Welcome to our amazing website" {\n}';
        const proposals = heuristicRename(fd);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("welcome_to_our_label");
    });

    // ── Parent Context ──

    it("uses parent group name for unnamed rect", () => {
        const fd = 'group @sidebar {\n  rect @rect_1 {\n    fill: #FFF\n  }\n}';
        const proposals = heuristicRename(fd);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("sidebar_rect");
    });

    it("ignores anonymous parent group names", () => {
        const fd = 'group @_group_1 {\n  rect @rect_1 {\n    fill: #FFF\n  }\n}';
        const proposals = heuristicRename(fd);
        // Both _group_1 and rect_1 are anonymous
        expect(proposals).toHaveLength(2);
        // rect_1 should NOT include _group_1 as prefix (anonymous parent ignored)
        const rectProposal = proposals.find((p) => p.oldId === "rect_1");
        expect(rectProposal).toBeDefined();
        expect(rectProposal!.newId).toBe("rect");
    });

    // ── Shape Detection ──

    it("detects circle from equal width and height ellipse", () => {
        const fd = 'ellipse @ellipse_1 {\n  w: 48 h: 48\n}';
        const proposals = heuristicRename(fd);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("circle");
    });

    it("detects wide bar from aspect ratio", () => {
        const fd = 'rect @rect_1 {\n  w: 400 h: 4\n}';
        const proposals = heuristicRename(fd);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("bar");
    });

    it("detects tall column from aspect ratio", () => {
        const fd = 'rect @rect_1 {\n  w: 4 h: 400\n}';
        const proposals = heuristicRename(fd);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].newId).toBe("column");
    });

    // ── Conflict Resolution ──

    it("resolves conflicts between heuristic proposals", () => {
        const fd = 'rect @rect_1 {\n  w: 100 h: 50\n}\nrect @rect_2 {\n  w: 100 h: 50\n}';
        const proposals = heuristicRename(fd);
        expect(proposals).toHaveLength(2);
        expect(proposals[0].newId).toBe("rect");
        // rect_2 already exists as the second anonymous ID, so suffix skips to _3
        expect(proposals[1].newId).toBe("rect_3");
    });

    // ── Edge Cases ──

    it("returns empty for document with no anonymous IDs", () => {
        const fd = 'rect @hero {\n  fill: #FFF\n}';
        expect(heuristicRename(fd)).toEqual([]);
    });

    it("returns empty for empty document", () => {
        expect(heuristicRename("")).toEqual([]);
    });

    it("handles mixed anonymous and semantic IDs", () => {
        const fd = 'rect @hero {\n}\nrect @rect_1 {\n  w: 100 h: 50\n}\ntext @_text_1 "Hello" {\n}';
        const proposals = heuristicRename(fd);
        expect(proposals).toHaveLength(2);
        // Only anonymous IDs should be renamed
        const oldIds = proposals.map((p) => p.oldId);
        expect(oldIds).toContain("rect_1");
        expect(oldIds).toContain("_text_1");
        expect(oldIds).not.toContain("hero");
    });

    it("handles text content with special characters", () => {
        const fd = 'text @_text_1 "Hello, World! 🌍" {\n}';
        const proposals = heuristicRename(fd);
        expect(proposals).toHaveLength(1);
        // Should strip non-alphanumeric chars
        expect(proposals[0].newId).toBe("hello_world_label");
    });
});
