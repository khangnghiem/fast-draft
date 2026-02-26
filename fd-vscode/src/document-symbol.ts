import * as vscode from "vscode";
import { parseDocumentSymbols, FdSymbol } from "./fd-parse";

export class FdDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument
  ): vscode.DocumentSymbol[] {
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      lines.push(document.lineAt(i).text);
    }
    const fdSymbols = parseDocumentSymbols(lines);
    return fdSymbols.map((s) => this.toDocumentSymbol(s, document));
  }

  private toDocumentSymbol(
    sym: FdSymbol,
    doc: vscode.TextDocument
  ): vscode.DocumentSymbol {
    const kindMap: Record<string, vscode.SymbolKind> = {
      group: vscode.SymbolKind.Module,
      rect: vscode.SymbolKind.Struct,
      ellipse: vscode.SymbolKind.Struct,
      path: vscode.SymbolKind.Struct,
      text: vscode.SymbolKind.String,
      style: vscode.SymbolKind.Class,
      edge: vscode.SymbolKind.Interface,
      spec: vscode.SymbolKind.Object,
      constraint: vscode.SymbolKind.Property,
    };

    const range = new vscode.Range(sym.startLine, 0, sym.endLine, doc.lineAt(sym.endLine).text.length);
    const selRange = new vscode.Range(sym.startLine, 0, sym.startLine, doc.lineAt(sym.startLine).text.length);
    const detail = sym.text ? `"${sym.text}"` : sym.kind;
    const dsym = new vscode.DocumentSymbol(
      sym.name,
      detail,
      kindMap[sym.kind] ?? vscode.SymbolKind.Variable,
      range,
      selRange
    );
    dsym.children = sym.children.map((c) => this.toDocumentSymbol(c, doc));
    return dsym;
  }
}
