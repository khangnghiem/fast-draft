import { describe, it, expect, vi } from "vitest";
import { runRefactor, summarizeRefactor } from "./ai-refactor";
import * as aiRenamify from "./ai-renamify";

// Mock the AI call to avoid actual API requests during tests
vi.mock("./ai-renamify", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./ai-renamify")>();
    return {
        ...actual,
        callRenamifyAi: vi.fn(),
    };
});

describe("runRefactor", () => {
    it("runs renamify pass and applies renames", async () => {
        const fdText = "rect @rect_1 {}";
        vi.mocked(aiRenamify.callRenamifyAi).mockResolvedValueOnce({
            proposals: [{ oldId: "rect_1", newId: "my_rect" }],
        });

        const result = await runRefactor(fdText);

        expect(result.renamed).toBe(1);
        expect(result.fdText).toContain("@my_rect");
        expect(result.warnings).toHaveLength(0);
    });

    it("runs style hoisting pass if wasmFormatFn provided", async () => {
        const fdText = "rect @r1 { fill: #f00 } rect @r2 { fill: #f00 }";
        vi.mocked(aiRenamify.callRenamifyAi).mockResolvedValueOnce({
            proposals: [],
        });

        // Mock format function that simulates hoisting a style
        const mockFormatFn = (input: string) => {
            return "style @shared { fill: #f00 }\nrect @r1 { use: @shared }\nrect @r2 { use: @shared }";
        };

        const result = await runRefactor(fdText, mockFormatFn);

        expect(result.stylesHoisted).toBe(1);
        expect(result.fdText).toContain("style @shared");
        expect(result.warnings).toHaveLength(0);
    });

    it("handles renamify error gracefully", async () => {
        const fdText = "rect @rect_1 {}";
        vi.mocked(aiRenamify.callRenamifyAi).mockResolvedValueOnce({
            proposals: [],
            error: "API rate limit",
        });

        const result = await runRefactor(fdText);

        expect(result.renamed).toBe(0);
        expect(result.fdText).toBe(fdText);
        expect(result.warnings).toContain("Renamify: API rate limit");
    });

    it("handles renamify exception gracefully", async () => {
        const fdText = "rect @rect_1 {}";
        vi.mocked(aiRenamify.callRenamifyAi).mockRejectedValueOnce(new Error("Network failure"));

        const result = await runRefactor(fdText);

        expect(result.renamed).toBe(0);
        expect(result.fdText).toBe(fdText);
        expect(result.warnings).toContain("Renamify failed: Network failure");
    });

    it("handles format function exception gracefully", async () => {
        const fdText = "rect @r1 {}";
        vi.mocked(aiRenamify.callRenamifyAi).mockResolvedValueOnce({
            proposals: [],
        });

        const mockFormatFn = (input: string) => {
            throw new Error("WASM panic");
        };

        const result = await runRefactor(fdText, mockFormatFn);

        expect(result.stylesHoisted).toBe(0);
        expect(result.fdText).toBe(fdText);
        expect(result.warnings).toContain("Style hoisting failed: WASM panic");
    });
});

describe("summarizeRefactor", () => {
    it("summarizes renamed nodes", () => {
        expect(summarizeRefactor({ renamed: 2, stylesHoisted: 0, fdText: "", warnings: [] }))
            .toBe("✦ Refactor: 2 node(s) renamed.");
    });

    it("summarizes hoisted styles", () => {
        expect(summarizeRefactor({ renamed: 0, stylesHoisted: 3, fdText: "", warnings: [] }))
            .toBe("✦ Refactor: 3 style(s) hoisted.");
    });

    it("summarizes both", () => {
        expect(summarizeRefactor({ renamed: 2, stylesHoisted: 3, fdText: "", warnings: [] }))
            .toBe("✦ Refactor: 2 node(s) renamed, 3 style(s) hoisted.");
    });

    it("reports no changes", () => {
        expect(summarizeRefactor({ renamed: 0, stylesHoisted: 0, fdText: "", warnings: [] }))
            .toBe("No changes needed — document is already clean.");
    });
});

    it("runs style hoisting pass safely if non-Error exception is thrown", async () => {
        const fdText = "rect @r1 {}";
        vi.mocked(aiRenamify.callRenamifyAi).mockResolvedValueOnce({
            proposals: [],
        });

        const mockFormatFn = (input: string) => {
            throw "String error";
        };

        const result = await runRefactor(fdText, mockFormatFn);

        expect(result.stylesHoisted).toBe(0);
        expect(result.fdText).toBe(fdText);
        expect(result.warnings).toContain("Style hoisting failed: String error");
    });

    it("runs renamify pass safely if non-Error exception is thrown", async () => {
        const fdText = "rect @r1 {}";
        vi.mocked(aiRenamify.callRenamifyAi).mockRejectedValueOnce("String error");

        const result = await runRefactor(fdText);

        expect(result.renamed).toBe(0);
        expect(result.fdText).toBe(fdText);
        expect(result.warnings).toContain("Renamify failed: String error");
    });
