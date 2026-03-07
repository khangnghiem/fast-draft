/**
 * AI Refactor — unified orchestrator combining Renamify + style extraction.
 *
 * Invoked via Canvas toolbar "Refactor" button or command palette.
 * Runs all cleanup passes in sequence:
 *   1. Rename anonymous IDs → semantic names (Renamify)
 *   2. Hoist repeated inline styles → shared theme blocks
 *   3. Round coordinates to 1dp precision (already handled by emitter)
 */

import { callRenamifyAi, applyGlobalRenames, RenamifyResult, RenameProposal } from "./ai-renamify";

export interface RefactorResult {
    /** Number of nodes renamed by Renamify. */
    renamed: number;
    /** Number of theme blocks hoisted from inline styles. */
    stylesHoisted: number;
    /** The final refactored FD text. */
    fdText: string;
    /** Any warnings or errors from sub-passes. */
    warnings: string[];
}

/**
 * Run the full refactoring pipeline on an FD document.
 *
 * @param fdText  The raw FD document text
 * @param wasmFormatFn  Optional WASM format function for style hoisting
 *   (fd_format from fd-wasm). If not provided, style hoisting is skipped.
 * @returns The refactored result
 */
export async function runRefactor(
    fdText: string,
    wasmFormatFn?: (input: string) => string,
): Promise<RefactorResult> {
    const warnings: string[] = [];
    let text = fdText;
    let renamed = 0;
    let stylesHoisted = 0;

    // ─── Pass 1: Renamify ─────────────────────────────────────────────────
    try {
        const renamifyResult: RenamifyResult = await callRenamifyAi(text);
        if (renamifyResult.error) {
            warnings.push(`Renamify: ${renamifyResult.error}`);
        } else if (renamifyResult.proposals.length > 0) {
            text = applyGlobalRenames(text, renamifyResult.proposals);
            renamed = renamifyResult.proposals.length;
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Renamify failed: ${msg}`);
    }

    // ─── Pass 2: Style hoisting via WASM format ───────────────────────────
    if (wasmFormatFn) {
        try {
            const before = text;
            text = wasmFormatFn(text);
            // Count hoisted themes by diffing theme blocks
            const themesBefore = (before.match(/^theme\s+/gm) || []).length;
            const themesAfter = (text.match(/^theme\s+/gm) || []).length;
            stylesHoisted = Math.max(0, themesAfter - themesBefore);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            warnings.push(`Style hoisting failed: ${msg}`);
        }
    }

    // Note: Pass 3 (coordinate rounding to 1dp) is handled automatically
    // by the Rust emitter's format_num function.

    return {
        renamed,
        stylesHoisted,
        fdText: text,
        warnings,
    };
}

/**
 * Build a human-readable summary of what the refactoring did.
 */
export function summarizeRefactor(result: RefactorResult): string {
    const parts: string[] = [];
    if (result.renamed > 0) {
        parts.push(`${result.renamed} node(s) renamed`);
    }
    if (result.stylesHoisted > 0) {
        parts.push(`${result.stylesHoisted} theme(s) hoisted`);
    }
    if (parts.length === 0) {
        return "No changes needed — document is already clean.";
    }
    return `✦ Refactor: ${parts.join(", ")}.`;
}
