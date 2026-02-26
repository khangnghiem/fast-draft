import * as vscode from "vscode";

export class FdDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("fd");
  }

  public activate(context: vscode.ExtensionContext): void {
    // Validate on open
    if (vscode.window.activeTextEditor?.document.languageId === "fd") {
      this.validateDocument(vscode.window.activeTextEditor.document);
    }

    // Validate on change (debounced)
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
        if (e.document.languageId === "fd") {
          this.scheduleValidation(e.document);
        }
      })
    );

    // Validate on open
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => {
        if (doc.languageId === "fd") {
          this.validateDocument(doc);
        }
      })
    );

    // Clear on close
    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
        this.diagnosticCollection.delete(doc.uri);
      })
    );

    context.subscriptions.push(this.diagnosticCollection);
  }

  private scheduleValidation(document: vscode.TextDocument): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.validateDocument(document);
    }, 300);
  }

  private validateDocument(document: vscode.TextDocument): void {
    const text = document.getText();
    const diagnostics: vscode.Diagnostic[] = [];

    const lines = text.split("\n");
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith("#")) continue;

      for (const ch of trimmed) {
        if (ch === "{") braceDepth++;
        if (ch === "}") braceDepth--;
      }

      if (braceDepth < 0) {
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(i, 0, i, line.length),
            "Unexpected closing brace '}'",
            vscode.DiagnosticSeverity.Error
          )
        );
        braceDepth = 0;
      }

      const hexMatch = trimmed.match(/#[0-9A-Fa-f]+\b/g);
      if (hexMatch) {
        for (const hex of hexMatch) {
          const len = hex.length - 1;
          if (![3, 4, 6, 8].includes(len)) {
            const col = line.indexOf(hex);
            diagnostics.push(
              new vscode.Diagnostic(
                new vscode.Range(i, col, i, col + hex.length),
                `Invalid hex color '${hex}' — expected #RGB, #RGBA, #RRGGBB, or #RRGGBBAA`,
                vscode.DiagnosticSeverity.Error
              )
            );
          }
        }
      }
    }

    if (braceDepth > 0) {
      const lastLine = lines.length - 1;
      diagnostics.push(
        new vscode.Diagnostic(
          new vscode.Range(lastLine, 0, lastLine, lines[lastLine].length),
          `${braceDepth} unclosed brace(s) — missing '}'`,
          vscode.DiagnosticSeverity.Error
        )
      );
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }
}
