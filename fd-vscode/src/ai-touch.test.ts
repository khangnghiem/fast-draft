import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { refineSelectedNodes } from "./ai-touch";
import * as vscode from "vscode";

// Mock vscode API for config
vi.mock("vscode");

describe("ai-touch refineSelectedNodes", () => {
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  afterEach(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;

    // Default mock config setup
    const mockGetConfig = vi.fn().mockImplementation((key: string) => {
      const configMap: Record<string, string | undefined> = {
        provider: "gemini",
        geminiApiKey: "fake-gemini-key",
        geminiModel: "gemini-1.5-pro",
        openaiApiKey: "fake-openai-key",
        openaiModel: "gpt-4o",
        anthropicApiKey: "fake-anthropic-key",
        anthropicModel: "claude-3-5-sonnet-20240620",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "llama3",
        openrouterApiKey: "fake-openrouter-key",
        openrouterModel: "meta-llama/llama-3-8b-instruct",
      };
      return configMap[key];
    });

    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: mockGetConfig,
    });
  });

  it("should return early if no nodes selected", async () => {
    const result = await refineSelectedNodes("rect @foo {}", []);
    expect(result.error).toBe("No nodes selected for refinement");
    expect(result.refinedText).toBe("rect @foo {}");
  });

  describe("Provider Validation", () => {
    it("should require gemini api key", async () => {
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: (k: string) => k === "provider" ? "gemini" : undefined
      });
      const result = await refineSelectedNodes("rect @foo {}", ["foo"]);
      expect(result.needsSettings).toBe(true);
      expect(result.error).toContain("Gemini API key not configured");
    });

    it("should require openai api key", async () => {
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: (k: string) => k === "provider" ? "openai" : undefined
      });
      const result = await refineSelectedNodes("rect @foo {}", ["foo"]);
      expect(result.needsSettings).toBe(true);
      expect(result.error).toContain("OpenAI API key not configured");
    });

    it("should require anthropic api key", async () => {
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: (k: string) => k === "provider" ? "anthropic" : undefined
      });
      const result = await refineSelectedNodes("rect @foo {}", ["foo"]);
      expect(result.needsSettings).toBe(true);
      expect(result.error).toContain("Anthropic API key not configured");
    });

    it("should require openrouter api key", async () => {
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: (k: string) => k === "provider" ? "openrouter" : undefined
      });
      const result = await refineSelectedNodes("rect @foo {}", ["foo"]);
      expect(result.needsSettings).toBe(true);
      expect(result.error).toContain("OpenRouter API key not configured");
    });

    it("should handle unknown provider", async () => {
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: (k: string) => k === "provider" ? "unknown_provider" : undefined
      });
      const result = await refineSelectedNodes("rect @foo {}", ["foo"]);
      expect(result.error).toBe("Unknown provider: unknown_provider");
    });
  });

  describe("API Calls", () => {
    const fdDoc = "rect @foo {}";
    const goodResponse = "rect @polished {}";

    it("should call Gemini successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: goodResponse }] } }]
        })
      });

      const result = await refineSelectedNodes(fdDoc, ["foo"]);

      expect(result.error).toBeUndefined();
      expect(result.refinedText).toBe(goodResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("generativelanguage.googleapis.com"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: expect.stringContaining("rect @foo {}")
        })
      );
    });

    it("should call OpenAI successfully", async () => {
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: (k: string) => {
          if (k === "provider") return "openai";
          if (k === "openaiApiKey") return "test-key";
          return "gpt-4o";
        }
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: goodResponse } }]
        })
      });

      const result = await refineSelectedNodes(fdDoc, ["foo"]);

      expect(result.error).toBeUndefined();
      expect(result.refinedText).toBe(goodResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          headers: expect.objectContaining({ "Authorization": "Bearer test-key" })
        })
      );
    });

    it("should call Anthropic successfully", async () => {
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: (k: string) => {
          if (k === "provider") return "anthropic";
          if (k === "anthropicApiKey") return "test-key";
          return "claude";
        }
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: goodResponse }]
        })
      });

      const result = await refineSelectedNodes(fdDoc, ["foo"]);

      expect(result.error).toBeUndefined();
      expect(result.refinedText).toBe(goodResponse);
    });

    it("should call Ollama successfully", async () => {
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: (k: string) => {
          if (k === "provider") return "ollama";
          if (k === "ollamaUrl") return "http://local:11434";
          return "llama3";
        }
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: goodResponse }
        })
      });

      const result = await refineSelectedNodes(fdDoc, ["foo"]);

      expect(result.error).toBeUndefined();
      expect(result.refinedText).toBe(goodResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://local:11434/api/chat",
        expect.anything()
      );
    });

    it("should handle Ollama connection error", async () => {
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: (k: string) => {
          if (k === "provider") return "ollama";
          if (k === "ollamaUrl") return "http://local:11434";
          return "llama3";
        }
      });

      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      const result = await refineSelectedNodes(fdDoc, ["foo"]);

      expect(result.error).toContain("Could not connect to Ollama");
    });

    it("should call OpenRouter successfully", async () => {
      (vscode.workspace.getConfiguration as any).mockReturnValue({
        get: (k: string) => {
          if (k === "provider") return "openrouter";
          if (k === "openrouterApiKey") return "test-key";
          return "llama3";
        }
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: goodResponse } }]
        })
      });

      const result = await refineSelectedNodes(fdDoc, ["foo"]);

      expect(result.error).toBeUndefined();
      expect(result.refinedText).toBe(goodResponse);
    });

    it("should handle API error responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized"
      });

      const result = await refineSelectedNodes(fdDoc, ["foo"]);

      expect(result.error).toContain("API error (401): Unauthorized");
      expect(result.refinedText).toBe(fdDoc); // Preserves original text
    });

    it("should reject responses without valid FD keywords", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "This is a conversational response without nodes" }] } }]
        })
      });

      const result = await refineSelectedNodes(fdDoc, ["foo"]);

      expect(result.error).toBe("AI returned invalid FD text. Original preserved.");
      expect(result.refinedText).toBe(fdDoc);
    });

    it("should strip markdown fences from response", async () => {
      const markdownResponse = "```fd\nrect @polished {}\n```";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: markdownResponse }] } }]
        })
      });

      const result = await refineSelectedNodes(fdDoc, ["foo"]);

      expect(result.error).toBeUndefined();
      expect(result.refinedText).toBe("rect @polished {}");
    });
  });
});
