import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { refineSelectedNodes, findAnonNodeIds } from "./ai-touch";
import * as vscode from "vscode";

// Mock VS Code API
vi.mock("vscode", () => ({
    workspace: {
        getConfiguration: vi.fn().mockReturnValue({
            get: vi.fn((key: string) => {
                if (key === "provider") return "gemini";
                if (key === "geminiApiKey") return "test-api-key";
                if (key === "geminiModel") return "gemini-1.5-flash";
                return undefined;
            }),
        }),
    },
}));

describe("ai-touch", () => {
    describe("refineSelectedNodes", () => {
        it("returns early if no nodes selected", async () => {
            const result = await refineSelectedNodes("rect @r1 {}", []);
            expect(result.refinedText).toBe("rect @r1 {}");
            expect(result.error).toBe("No nodes selected for refinement");
        });

        // Test API failure gracefully (using a mock to intercept fetch)
        it("handles API failure", async () => {
            const globalFetch = global.fetch;
            global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

            const result = await refineSelectedNodes("rect @_rect_0 {}", ["_rect_0"]);

            expect(result.refinedText).toBe("rect @_rect_0 {}");
            expect(result.error).toContain("AI Refine failed: Network Error");

            global.fetch = globalFetch;
        });
    });

    describe("findAnonNodeIds", () => {
        it("finds anonymous node ids", () => {
            const ids = findAnonNodeIds("rect @_rect_0 {} text @_text_1 {} group @my_group {}");
            expect(ids).toContain("_rect_0");
            expect(ids).toContain("_text_1");
            expect(ids).not.toContain("my_group");
        });

        it("returns empty array for no anonymous node ids", () => {
            const ids = findAnonNodeIds("rect @r1 {} text @t1 {} group @g1 {}");
            expect(ids).toHaveLength(0);
        });
    });

    describe("stripMarkdownFences behavior", () => {
        it("returns error if AI returns invalid FD text", async () => {
            // Mock API to return something without valid node keywords
            const globalFetch = global.fetch;
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{ content: { parts: [{ text: "This is just some plain string without keywords" }] } }]
                })
            });

            const result = await refineSelectedNodes("rect @r1 {}", ["r1"]);
            expect(result.error).toBe("AI returned invalid FD text. Original preserved.");

            global.fetch = globalFetch;
        });

        it("strips markdown fences and returns text if valid", async () => {
            const globalFetch = global.fetch;
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{ content: { parts: [{ text: "\`\`\`fd\nrect @r1 {\n  fill: #fff\n}\n\`\`\`" }] } }]
                })
            });

            const result = await refineSelectedNodes("rect @r1 {}", ["r1"]);
            expect(result.refinedText).toBe("rect @r1 {\n  fill: #fff\n}");

            global.fetch = globalFetch;
        });
    });
});

    describe("Provider Error Handling", () => {
        let mockGetConfig: any;

        beforeEach(() => {
            mockGetConfig = vscode.workspace.getConfiguration();
        });

        afterEach(() => {
            vi.clearAllMocks();
        });

        it("fails gracefully if provider is unknown", async () => {
            mockGetConfig.get.mockImplementation((key: string) => {
                if (key === "provider") return "unknown-provider";
                return undefined;
            });

            const result = await refineSelectedNodes("rect @r1 {}", ["r1"]);
            expect(result.error).toContain("Unknown provider: unknown-provider");
        });

        it("fails gracefully if gemini api key is missing", async () => {
            mockGetConfig.get.mockImplementation((key: string) => {
                if (key === "provider") return "gemini";
                if (key === "geminiApiKey") return "";
                return undefined;
            });

            const result = await refineSelectedNodes("rect @r1 {}", ["r1"]);
            expect(result.error).toContain("Gemini API key not configured");
            expect(result.needsSettings).toBe(true);
        });

        it("fails gracefully if openai api key is missing", async () => {
            mockGetConfig.get.mockImplementation((key: string) => {
                if (key === "provider") return "openai";
                if (key === "openaiApiKey") return "";
                return undefined;
            });

            const result = await refineSelectedNodes("rect @r1 {}", ["r1"]);
            expect(result.error).toContain("OpenAI API key not configured");
            expect(result.needsSettings).toBe(true);
        });

        it("fails gracefully if anthropic api key is missing", async () => {
            mockGetConfig.get.mockImplementation((key: string) => {
                if (key === "provider") return "anthropic";
                if (key === "anthropicApiKey") return "";
                return undefined;
            });

            const result = await refineSelectedNodes("rect @r1 {}", ["r1"]);
            expect(result.error).toContain("Anthropic API key not configured");
            expect(result.needsSettings).toBe(true);
        });

        it("fails gracefully if openrouter api key is missing", async () => {
            mockGetConfig.get.mockImplementation((key: string) => {
                if (key === "provider") return "openrouter";
                if (key === "openrouterApiKey") return "";
                return undefined;
            });

            const result = await refineSelectedNodes("rect @r1 {}", ["r1"]);
            expect(result.error).toContain("OpenRouter API key not configured");
            expect(result.needsSettings).toBe(true);
        });
    });
