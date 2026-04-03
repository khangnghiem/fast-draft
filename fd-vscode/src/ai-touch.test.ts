import { describe, it, expect, vi } from "vitest";
import * as vscode from "vscode";
import { getAiConfig, refineSelectedNodes } from "./ai-touch";

vi.mock("vscode");

describe("getAiConfig", () => {
    it("returns default configuration when nothing is set", () => {
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: vi.fn().mockReturnValue(undefined),
            has: vi.fn(),
            inspect: vi.fn(),
            update: vi.fn(),
        } as any);

        const config = getAiConfig();
        expect(config.provider).toBe("gemini");
        expect(config.apiKey).toBe("");
        expect(config.model).toBe("gemini-2.0-flash");
        expect(config.ollamaUrl).toBe("http://localhost:11434");
    });

    it("returns configured values", () => {
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: vi.fn().mockImplementation((key: string) => {
                const map: Record<string, string> = {
                    provider: "openai",
                    openaiApiKey: "test-key",
                    openaiModel: "gpt-4o",
                };
                return map[key];
            }),
            has: vi.fn(),
            inspect: vi.fn(),
            update: vi.fn(),
        } as any);

        const config = getAiConfig();
        expect(config.provider).toBe("openai");
        expect(config.apiKey).toBe("test-key");
        expect(config.model).toBe("gpt-4o");
    });
});

describe("refineSelectedNodes", () => {
    it("returns error when no nodes are selected", async () => {
        const result = await refineSelectedNodes("rect @rect_1 {}", []);
        expect(result.error).toBe("No nodes selected for refinement");
    });

    it("returns error when API key is missing for gemini", async () => {
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: vi.fn().mockImplementation((key: string) => {
                if (key === "provider") return "gemini";
                return undefined;
            }),
            has: vi.fn(),
            inspect: vi.fn(),
            update: vi.fn(),
        } as any);

        const result = await refineSelectedNodes("rect @rect_1 {}", ["rect_1"]);
        expect(result.needsSettings).toBe(true);
        expect(result.error).toContain("Gemini API key not configured");
    });

    it("returns error when API key is missing for openai", async () => {
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: vi.fn().mockImplementation((key: string) => {
                if (key === "provider") return "openai";
                return undefined;
            }),
            has: vi.fn(),
            inspect: vi.fn(),
            update: vi.fn(),
        } as any);

        const result = await refineSelectedNodes("rect @rect_1 {}", ["rect_1"]);
        expect(result.needsSettings).toBe(true);
        expect(result.error).toContain("OpenAI API key not configured");
    });
});
