/**
 * Minimal vscode mock for Vitest.
 * Only stubs the APIs actually used by ai-touch.ts (workspace.getConfiguration).
 */
export const workspace = {
    getConfiguration: (_section?: string) => ({
        get: <T>(_key: string): T | undefined => undefined,
    }),
};

export const window = {
    showInformationMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
};

export const Uri = {
    parse: (s: string) => ({ toString: () => s }),
};
